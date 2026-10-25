import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { isConfigured } from "../lib/supabase";

export default function Login() {
  const { session, access, loading, error, signInWithGoogle } = useAuth();

  if (!loading && session && access) return <Navigate to={access.destination} replace />;

  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center shadow-xl">
        <img src="/brand/logo-full.png" alt="FAST STORE" className="mx-auto h-48 w-48 object-contain" />
        <h1 className="mt-2 text-2xl font-semibold">Welcome to FAST STORE</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in securely with Google. We never see or store your Google password.
        </p>

        {!isConfigured && (
          <p role="alert" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Setup required: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.
          </p>
        )}
        {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <button
          onClick={signInWithGoogle}
          disabled={!isConfigured || loading}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 px-4 py-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {loading ? "Checking session…" : "Continue with Google"}
        </button>

        <p className="mt-6 text-xs text-slate-400">
          By continuing you agree to our <Link className="underline" to="/terms">Terms of Service</Link> and{" "}
          <Link className="underline" to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
