"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useExplorer } from "./explorer-store";

// Client-side route guard: redirects to /login if there's no session. Not a
// security boundary (RLS on the `visits` table is) — just keeps signed-out
// users out of pages that assume a logged-in user. Also kicks off loading
// the signed-in user's Explorer Passport memories, since every protected
// page needs that loaded regardless of which one first mounts.
//
// Deliberately relies ONLY on onAuthStateChange rather than also calling
// getSession() separately — that guarantees exactly one source of truth.
// Calling getSession() in parallel raced it: under React 18 Strict Mode's
// double-effect-invocation, getSession() could resolve with a stale null
// before the client finished restoring the session from storage, firing a
// false redirect straight back to /login even with a perfectly valid,
// unexpired token sitting in localStorage.
export function useRequireAuth() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const loadVisits = useExplorer((s) => s.loadVisits);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      if (!newSession) {
        // A null session here can mean "genuinely signed out", but it can
        // also mean the stored access token expired between page loads
        // before auto-refresh got a chance to run (e.g. after sitting idle,
        // or a fresh reload restarting the client's refresh timer). Try one
        // explicit refresh with the stored refresh token before committing
        // to a redirect, so an expired-but-recoverable session doesn't
        // silently bounce the user back to the login screen.
        supabase.auth.refreshSession().then(({ data: refreshed }) => {
          if (!active) return;
          setSession(refreshed.session);
          if (!refreshed.session) router.replace("/login");
          else loadVisits();
        });
        return;
      }
      setSession(newSession);
      loadVisits();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { session, loading: session === undefined };
}
