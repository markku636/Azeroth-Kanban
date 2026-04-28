"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

interface PermissionsState {
  permissions: string[];
  isLoading: boolean;
}

// Client-side cache — TTL 5 分鐘自動失效
let cachedPermissions: string[] | null = null;
let cacheRolesKey: string | null = null;
let cacheExpiresAt = 0;

const CACHE_TTL_MS = 5 * 60 * 1000;

function isCacheValid(rolesKey: string): boolean {
  return (
    cachedPermissions !== null &&
    cacheRolesKey === rolesKey &&
    Date.now() < cacheExpiresAt
  );
}

/**
 * 取得當前使用者的權限列表
 */
export function usePermissions(): PermissionsState {
  const { data: session, status } = useSession();
  const [state, setState] = useState<PermissionsState>({
    permissions: cachedPermissions ?? [],
    isLoading: !cachedPermissions,
  });

  const roles = session?.user?.roles ?? [];
  const rolesKey = [...roles].sort().join(",");

  useEffect(() => {
    if (status === "loading") {return;}
    if (!session?.user || !roles.length) {
      setState({ permissions: [], isLoading: false });
      return;
    }

    // If cache is valid for current roles AND still within TTL, skip fetch
    if (isCacheValid(rolesKey)) {
      setState({ permissions: cachedPermissions!, isLoading: false });
      return;
    }

    let cancelled = false;

    async function fetchPermissions() {
      try {
        const res = await fetch("/api/v1/admin/user/permissions");
        if (!res.ok) {throw new Error("Failed to fetch permissions");}
        const json = await res.json();
        const perms: string[] = json.data ?? [];

        if (!cancelled) {
          cachedPermissions = perms;
          cacheRolesKey = rolesKey;
          cacheExpiresAt = Date.now() + CACHE_TTL_MS;
          setState({ permissions: perms, isLoading: false });
        }
      } catch {
        if (!cancelled) {
          setState({ permissions: [], isLoading: false });
        }
      }
    }

    fetchPermissions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, rolesKey]);

  return state;
}

/**
 * 判斷當前使用者是否有特定權限
 */
export function useHasPermission(code: string): boolean {
  const { permissions } = usePermissions();
  return permissions.includes(code);
}

/**
 * 清除客戶端權限快取（登出時使用）
 */
export function clearClientPermissionCache(): void {
  cachedPermissions = null;
  cacheRolesKey = null;
  cacheExpiresAt = 0;
}
