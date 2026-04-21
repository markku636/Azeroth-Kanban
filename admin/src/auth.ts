import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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

        if (!member) {
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
    }),
  ],

  pages: {
    signIn: "/admin/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 8, // 8 hours
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as { id: string; roles?: string[] };
        token.memberId = u.id;
        token.roles = u.roles ?? [];
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
