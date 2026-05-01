import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/types";

export type ProfileRow = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  department: string | null;
  role: UserRole;
  team_lead_id: string | null;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
};

type AuthContextValue = {
  session: Session | null;
  user: SupabaseUser | null;
  profile: ProfileRow | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  try {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (error) return null;
    return data as ProfileRow;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileVersion, setProfileVersion] = useState(0);

  const refreshProfile = async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const next = await fetchProfile(user.id);
    setProfile(next);
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Avoid calling Supabase auth APIs here to prevent lock races.
      // We rely on the INITIAL_SESSION event from onAuthStateChange.
    };

    init();

    // IMPORTANT: do not call async Supabase APIs inside onAuthStateChange.
    // Supabase has a known deadlock bug when async calls happen here.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setProfile(null);
      setProfileVersion((v) => v + 1);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch profile outside of auth callbacks (avoids auth-js deadlocks).
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user) {
        setProfile(null);
        return;
      }

      const next = await fetchProfile(user.id);
      if (!cancelled) setProfile(next);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profileVersion]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const value = useMemo<AuthContextValue>(
    () => ({ session, user, profile, loading, refreshProfile, signOut }),
    [session, user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
  return ctx;
}
