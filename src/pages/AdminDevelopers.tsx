import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, btn, btnDanger } from "../lib/admin";
import Shell from "./AdminShell";

type Dev = { id: string; display_name: string; legal_name: string; country: string; status: string; developer_permissions: { can_publish: boolean; revoked_at: string | null } | null };

export default function AdminDevelopers() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<Dev[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("developer_profiles")
      .select("id,display_name,legal_name,country,status,developer_permissions(can_publish,revoked_at)")
      .order("created_at", { ascending: false });
    if (e) setError("Could not load developers."); else { setError(null); setRows((data as unknown as Dev[]) ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function setPublish(d: Dev, allow: boolean) {
    const now = new Date().toISOString();
    const { error: e } = await supabase.from("developer_permissions").upsert(
      allow ? { developer_id: d.id, can_publish: true, granted_by: me, granted_at: now, revoked_at: null }
            : { developer_id: d.id, can_publish: false, revoked_at: now }, { onConflict: "developer_id" });
    if (e) { setError("Could not update permission."); return; }
    await audit(me, allow ? "developer.grant_publish" : "developer.revoke_publish", "developer_profile", d.id);
    load();
  }

  return (
    <Shell title="Developers">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-slate-500">No developers yet.</p>}
      {rows?.map((d) => {
        const can = Boolean(d.developer_permissions?.can_publish && !d.developer_permissions.revoked_at);
        return (
          <div key={d.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{d.display_name}</p>
              <p className="text-xs text-slate-500">{d.legal_name} · {d.country} · {d.status}</p>
            </div>
            {can ? <button className={btnDanger} onClick={() => setPublish(d, false)}>Revoke</button>
                 : <button className={btn} onClick={() => setPublish(d, true)}>Allow publishing</button>}
          </div>
        );
      })}
    </Shell>
  );
}
