import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Shell({ title, back, children }: { title: string; back?: { to: string; label: string }; children: ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Link to="/"><img src="/brand/icon.png" alt="FAST STORE" className="h-9 w-9 object-contain" /></Link>
        <h1 className="flex-1 truncate font-semibold">{title}</h1>
        {back && <Link to={back.to} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">{back.label}</Link>}
        <button onClick={signOut} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Sign out</button>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-4">{children}</main>
    </div>
  );
}
