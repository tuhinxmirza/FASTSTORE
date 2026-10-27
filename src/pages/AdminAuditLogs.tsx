import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import Shell from "./AdminShell";

type Log = { id: string; action: string; target_type: string; reason: string | null; created_at: string };

export default function AdminAuditLogs() {
  const [rows, setRows] = useState<Log[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("admin_audit_logs").select("id,action,target_type,reason,created_at")
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data, error: e }) => { if (e) setError("Could not load audit logs."); else setRows((data as Log[]) ?? []); });
  }, []);
  return (
    <Shell title="Audit logs">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-slate-500">No actions recorded yet.</p>}
      {rows?.map((r) => (
        <div key={r.id} className="rounded-2xl border border-slate-200 p-3 text-sm">
          <p className="font-medium">{r.action} <span className="font-normal text-slate-500">· {r.target_type}</span></p>
          {r.reason && <p className="text-slate-600">{r.reason}</p>}
          <p className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</p>
        </div>
      ))}
    </Shell>
  );
}
