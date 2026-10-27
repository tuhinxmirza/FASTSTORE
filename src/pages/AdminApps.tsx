import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, btn, btnDanger, btnPrimary } from "../lib/admin";
import Shell from "./AdminShell";

type AppRow = { id: string; name: string; package_name: string; status: string; featured: boolean };

export default function AdminApps() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<AppRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("apps").select("id,name,package_name,status,featured").order("created_at", { ascending: false });
    if (e) setError("Could not load apps."); else { setError(null); setRows((data as AppRow[]) ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function update(a: AppRow, patch: Partial<AppRow> & { published_at?: string }, action: string) {
    const { error: e } = await supabase.from("apps").update(patch).eq("id", a.id);
    if (e) { setError("Could not update the app."); return; }
    await audit(me, action, "app", a.id);
    load();
  }

  return (
    <Shell title="Apps">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {rows?.length === 0 && <p className="text-slate-500">No apps yet.</p>}
      {rows?.map((a) => (
        <div key={a.id} className="space-y-2 rounded-2xl border border-slate-200 p-4">
          <p className="font-medium">{a.name} <span className="text-xs font-normal text-slate-500">· {a.status}</span></p>
          <p className="text-xs text-slate-500">{a.package_name}</p>
          <div className="flex flex-wrap gap-2">
            {a.status !== "published" && <button className={btnPrimary} onClick={() => update(a, { status: "published", published_at: new Date().toISOString() }, "app.publish")}>Publish</button>}
            {a.status === "published" && <button className={btn} onClick={() => update(a, { status: "unpublished" }, "app.unpublish")}>Unpublish</button>}
            {a.status !== "suspended" && <button className={btnDanger} onClick={() => update(a, { status: "suspended" }, "app.suspend")}>Suspend</button>}
            <button className={btn} onClick={() => update(a, { featured: !a.featured }, a.featured ? "app.unfeature" : "app.feature")}>{a.featured ? "Unfeature" : "Feature"}</button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
