import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, notify, btn, btnDanger, btnPrimary, fieldCls } from "../lib/admin";
import Shell from "./AdminShell";

type AppRow = { id: string; developer_id: string; name: string; package_name: string; status: string; featured: boolean; decision_reason: string | null; created_at: string };
type Ver = { app_id: string; apk_sha256: string | null; version_name: string; validation: Record<string, unknown> };

export default function AdminApps() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<AppRow[] | null>(null);
  const [vers, setVers] = useState<Ver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [a, v] = await Promise.all([
      supabase.from("apps").select("id,developer_id,name,package_name,status,featured,decision_reason,created_at").order("created_at", { ascending: false }),
      supabase.from("app_versions").select("app_id,apk_sha256,version_name,validation").eq("is_current", true),
    ]);
    if (a.error) setError("Could not load apps."); else { setError(null); setRows((a.data as AppRow[]) ?? []); }
    setVers((v.data as Ver[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function update(a: AppRow, patch: Record<string, unknown>, action: string, note?: { type: string; title: string; body?: string }) {
    const reason = (reasons[a.id] ?? "").trim();
    if (["app.reject", "app.suspend"].includes(action) && !reason) { setError("Please write a reason for the developer first."); return; }
    const { error: e } = await supabase.from("apps").update(patch).eq("id", a.id);
    if (e) { setError("Could not update the app."); return; }
    await audit(me, action, "app", a.id, reason || null);
    if (note) await notify(a.developer_id, note.type, note.title, note.body ?? (reason || null));
    setError(null); load();
  }

  const nameCount = new Map<string, number>();
  (rows ?? []).forEach((r) => nameCount.set(r.name.trim().toLowerCase(), (nameCount.get(r.name.trim().toLowerCase()) ?? 0) + 1));
  const hashApps = new Map<string, string[]>();
  vers.forEach((x) => { if (x.apk_sha256) hashApps.set(x.apk_sha256, [...(hashApps.get(x.apk_sha256) ?? []), x.app_id]); });
  const warnings = (a: AppRow) => {
    const w: string[] = [];
    if ((nameCount.get(a.name.trim().toLowerCase()) ?? 0) > 1) w.push("Another app has the same name (possible copy).");
    const v = vers.find((x) => x.app_id === a.id);
    if (v?.apk_sha256 && (hashApps.get(v.apk_sha256)?.length ?? 0) > 1) w.push("The same APK file was uploaded for another app.");
    if (v && (v.validation as { manifest?: boolean }).manifest === false) w.push("APK check failed.");
    return w;
  };

  const shown = (rows ?? []).filter((a) => filter === "all" || a.status === "pending_review");
  return (
    <Shell title="Apps">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className={filter === "pending" ? btnPrimary : btn} onClick={() => setFilter("pending")}>Waiting for review</button>
        <button className={filter === "all" ? btnPrimary : btn} onClick={() => setFilter("all")}>All apps</button>
      </div>
      {!rows && !error && <p className="text-slate-500">Loading…</p>}
      {rows && shown.length === 0 && <p className="text-slate-500">Nothing here.</p>}
      {shown.map((a) => (
        <div key={a.id} className="space-y-2 rounded-2xl border border-slate-200 p-4">
          <p className="font-medium">{a.name} <span className="text-xs font-normal text-slate-500">· {a.status.replace("_", " ")}</span></p>
          <p className="text-xs text-slate-500">{a.package_name}</p>
          {warnings(a).map((w) => <p key={w} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">⚠ {w}</p>)}
          <textarea className={fieldCls} rows={2} placeholder="Reason / note for the developer (required to reject or suspend)" value={reasons[a.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [a.id]: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            {a.status !== "published" && <button className={btnPrimary} onClick={() => update(a, { status: "published", published_at: new Date().toISOString(), decision_reason: null }, "app.publish", { type: "app_published", title: `${a.name} is now live on FAST STORE`, body: "Your app was approved and published." })}>Publish</button>}
            {["pending_review", "submitted"].includes(a.status) && <button className={btnDanger} onClick={() => update(a, { status: "rejected", decision_reason: (reasons[a.id] ?? "").trim() }, "app.reject", { type: "app_rejected", title: `${a.name} was rejected` })}>Reject</button>}
            {a.status === "published" && <button className={btn} onClick={() => update(a, { status: "unpublished" }, "app.unpublish")}>Unpublish</button>}
            {a.status !== "suspended" && <button className={btnDanger} onClick={() => update(a, { status: "suspended", decision_reason: (reasons[a.id] ?? "").trim() }, "app.suspend", { type: "app_suspended", title: `${a.name} was suspended` })}>Suspend</button>}
            <button className={btn} onClick={() => update(a, { featured: !a.featured }, a.featured ? "app.unfeature" : "app.feature")}>{a.featured ? "Unfeature" : "Feature"}</button>
          </div>
        </div>
      ))}
    </Shell>
  );
}
