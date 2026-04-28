"use client";

import { atom, useAtom } from "jotai";
import { useSession } from "next-auth/react";
import { useCallback, useEffect } from "react";

const STORAGE_KEY_PREFIX = "iqt-menu-visited";

const visitedRoutesAtom = atom<Set<string>>(new Set<string>());

function readFromStorage(storageKey: string): Set<string> {
  if (typeof window === "undefined") {return new Set();}
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeToStorage(storageKey: string, visited: Set<string>): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(visited)));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

export function useMenuNewBadge() {
  const [visited, setVisited] = useAtom(visitedRoutesAtom);
  const { data: session } = useSession();
  const userEmail = (session?.user as { email?: string } | undefined)?.email ?? "anonymous";
  const storageKey = `${STORAGE_KEY_PREFIX}-${userEmail}`;

  // Hydrate atom from localStorage once the session / storageKey is ready
  useEffect(() => {
    const stored = readFromStorage(storageKey);
    setVisited(stored);
  }, [storageKey, setVisited]);

  const isNewBadgeVisible = useCallback(
    (href: string): boolean => !visited.has(href),
    [visited]
  );

  const markVisited = useCallback(
    (href: string): void => {
      if (visited.has(href)) {return;}
      const updated = new Set(visited);
      updated.add(href);
      setVisited(updated);
      writeToStorage(storageKey, updated);
    },
    [visited, setVisited, storageKey]
  );

  return { isNewBadgeVisible, markVisited };
}
