import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import Shell from "./Shell";

type A = { id: string; name: string; package_name: string; status: string; decision_reason: string | null };
const TONE: Record<string, string> = {
  published: "bg-emerald-50 text-emerald-700", pending_review: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-600", suspended: "bg-red-50 text-red-600",
};

export default function DeveloperApps() {
  const { session } = useAuth();
  const [rows, setRows] = useState<A[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("apps").select("id,name,package_name,status,decision_reason").eq("developer_id", session!.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error: e }) => { if (e) setError("Could not load your apps."); else setRows((data as A[]) ?? []); });
  }, [session]);
  return (
    <Shell title="My apps" back={{ to: "/developer", label: "Console" }}>
      <Link to="/developer/apps/new" className="inline-block rounded-full bg-blue-700 px-6 py-2.5 font-medium text-white">+ New app</Link>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-slate-500">You have no apps yet.</p>}
      {rows?.map((a) => (
        <Link key={a.id} to={`/developer/apps/${a.id}`} className="block rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-medium">{a.name}</p>
            <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${TONE[a.status] ?? "bg-slate-100 text-slate-700"}`}>{a.status.replace("_", " ")}</span>
          </div>
          <p className="truncate text-xs text-slate-500">{a.package_name}</p>
          {a.status === "rejected" && a.decision_reason && <p className="mt-2 text-sm text-red-600">Note: {a.decision_reason}</p>}
        </Link>
      ))}
    </Shell>
  );
}
