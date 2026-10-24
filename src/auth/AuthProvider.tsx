import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export type Role = "admin" | "developer" | "user";
type Access = { role: Role; developerStatus: string | null; destination: string };

type Ctx = {
  session: Session | null;
  access: Access | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function resolveAccess(s: Session | null) {
    setSession(s);
    if (!s) { setAccess(null); setLoading(false); return; }
    // The server decides the role; the admin allowlist lives only in the Edge Function.
    const { data, error: fnErr } = await supabase.functions.invoke<Access>("sync-admin");
    if (fnErr || !data) {
      setError("Could not verify your account. Please try again.");
      await supabase.auth.signOut();
      setAccess(null);
    } else {
      setError(null);
      setAccess(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => resolveAccess(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => resolveAccess(s), 0); // avoid deadlock inside the auth callback
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (e) setError(e.message);
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{ session, access, loading, error, signInWithGoogle, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}
