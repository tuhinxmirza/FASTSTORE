import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, btn, btnDanger, fieldCls } from "../lib/admin";
import Shell from "./AdminShell";

type User = { id: string; email: string; full_name: string | null; suspended: boolean };

export default function AdminUsers() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<User[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("profiles").select("id,email,full_name,suspended").order("created_at", { ascending: false }).limit(200);
    if (e) setError("Could not load users."); else { setError(null); setRows((data as User[]) ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(u: User) {
    const { error: e } = await supabase.from("profiles").update({ suspended: !u.suspended }).eq("id", u.id);
    if (e) { setError("Could not update the user."); return; }
    await audit(me, u.suspended ? "user.unsuspend" : "user.suspend", "profile", u.id);
    load();
  }

  const shown = (rows ?? []).filter((u) => `${u.email} ${u.full_name ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Shell title="Users">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <input className={fieldCls} placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {shown.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{u.full_name ?? u.email}</p>
            <p className="truncate text-xs text-slate-500">{u.email}{u.suspended && " · suspended"}</p>
          </div>
          {u.id !== me && <button className={u.suspended ? btn : btnDanger} onClick={() => toggle(u)}>{u.suspended ? "Restore" : "Suspend"}</button>}
        </div>
      ))}
    </Shell>
  );
}
