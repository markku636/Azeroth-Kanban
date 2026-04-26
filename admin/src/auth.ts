import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import KeycloakProvider from "next-auth/providers/keycloak";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const ALLOW_CREDENTIALS = process.env.AUTH_ALLOW_CREDENTIALS === "true";

const ROLE_PRIORITY = ["admin", "user", "viewer"] as const;
type SystemRole = (typeof ROLE_PRIORITY)[number];

interface KeycloakProfile {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
}

function getIp(request?: Request): string | null {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

async function recordLoginEvent(data: {
  email: string;
  memberId?: string;
  provider: string;
  status: "success" | "failed";
  failureReason?: string;
  ipAddress?: string | null;
}): Promise<void> {
  try {
    await prisma.loginRecord.create({
      data: {
        email: data.email,
        memberId: data.memberId ?? null,
        provider: data.provider,
        status: data.status,
        failureReason: data.failureReason ?? null,
        ipAddress: data.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error("[Auth/recordLoginEvent] 寫入登入記錄失敗", err);
  }
}

function pickPrimaryRole(roles: readonly string[] | undefined): SystemRole | null {
  if (!roles || roles.length === 0) return null;
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return null;
}

const providers: Provider[] = [];

if (
  process.env.AUTH_KEYCLOAK_ID &&
  process.env.AUTH_KEYCLOAK_SECRET &&
  process.env.AUTH_KEYCLOAK_ISSUER
) {
  providers.push(
    KeycloakProvider({
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
    })
  );
}

if (ALLOW_CREDENTIALS) {
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "帳號密碼",
      credentials: {
        username: { label: "帳號", type: "text" },
        password: { label: "密碼", type: "password" },
      },
      async authorize(credentials, request) {
        if (!credentials?.username || !credentials?.password) return null;
        const email = (credentials.username as string).trim().toLowerCase();
        const password = credentials.password as string;
        const ip = getIp(request as Request | undefined);

        const member = await prisma.member.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, password: true, role: true, isActive: true },
        });

        if (!member || !member.password) {
          await recordLoginEvent({ email, provider: "credentials", status: "failed", failureReason: "invalid_credentials", ipAddress: ip });
          return null;
        }
        if (!member.isActive) {
          await recordLoginEvent({ email, memberId: member.id, provider: "credentials", status: "failed", failureReason: "inactive_account", ipAddress: ip });
          return null;
        }
        const isMatch = await bcrypt.compare(password, member.password);
        if (!isMatch) {
          await recordLoginEvent({ email, memberId: member.id, provider: "credentials", status: "failed", failureReason: "invalid_credentials", ipAddress: ip });
          return null;
        }

        await recordLoginEvent({ email: member.email, memberId: member.id, provider: "credentials", status: "success", ipAddress: ip });
        return {
          id: member.id,
          name: member.name,
          email: member.email,
          image: null,
          roles: member.role ? [member.role] : [],
        };
      },
    })
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },

  callbacks: {
    async signIn({ account, profile }) {
      // Keycloak SSO 流程：upsert Member by keycloak_sub，同步 role
      if (account?.provider === "keycloak" && profile) {
        const kcProfile = profile as KeycloakProfile;
        const sub = kcProfile.sub;
        if (!sub) return false;

        const email =
          (kcProfile.email ?? kcProfile.preferred_username ?? `${sub}@keycloak.local`).toLowerCase();
        const name = kcProfile.name ?? kcProfile.preferred_username ?? email;
        const primaryRole = pickPrimaryRole(kcProfile.realm_access?.roles);

        try {
          const member = await prisma.member.upsert({
            where: { keycloakSub: sub },
            update: {
              email,
              name,
              isActive: true,
              role: primaryRole ?? undefined,
            },
            create: {
              email,
              name,
              isActive: true,
              keycloakSub: sub,
              role: primaryRole,
            },
          });
          await recordLoginEvent({
            email: member.email,
            memberId: member.id,
            provider: "keycloak",
            status: "success",
          });
        } catch (err) {
          console.error("[Auth/signIn] Keycloak upsert 失敗", err);
          await recordLoginEvent({
            email,
            provider: "keycloak",
            status: "failed",
            failureReason: "upsert_error",
          });
          return false;
        }
      }
      return true;
    },

    async jwt({ token, user, account, profile }) {
      // 第一次登入：把 memberId / roles 塞進 token
      if (user) {
        const u = user as { id?: string; roles?: string[] };
        if (u.id) token.memberId = u.id;
        if (u.roles) token.roles = u.roles;
      }
      // Keycloak：第一次登入時還沒有 user.id（auth.ts 設計上沒有透過 adapter），補查一次 DB
      if (account?.provider === "keycloak" && profile) {
        const kcProfile = profile as KeycloakProfile;
        const member = await prisma.member.findUnique({
          where: { keycloakSub: kcProfile.sub },
          select: { id: true, role: true },
        });
        if (member) {
          token.memberId = member.id;
          token.roles = member.role ? [member.role] : [];
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.memberId = (token.memberId as string) ?? "";
      session.user.roles = (token.roles as string[]) ?? [];
      return session;
    },

    async authorized({ auth }) {
      return !!auth?.user;
    },
  },
});
