import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, fieldCls, btnPrimary } from "../lib/admin";
import Shell from "./Shell";

export default function AdminSettings() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [v, setV] = useState({ publishing_mode: "admin_review", max_apk_mb: "200", store_name: "FAST STORE", announcement: "" });
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from("platform_settings").select("key,value").then(({ data, error }) => {
      if (error) { setMsg({ ok: false, text: "Could not load settings." }); return; }
      const m: Record<string, unknown> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => { m[r.key] = r.value; });
      setV((cur) => ({
        publishing_mode: String(m.publishing_mode ?? cur.publishing_mode), max_apk_mb: String(m.max_apk_mb ?? cur.max_apk_mb),
        store_name: String(m.store_name ?? cur.store_name), announcement: String(m.announcement ?? cur.announcement),
      }));
      setLoaded(true);
    });
  }, []);

  async function save() {
    const mb = Number(v.max_apk_mb);
    if (!Number.isFinite(mb) || mb < 1 || mb > 2000) { setMsg({ ok: false, text: "APK size limit must be between 1 and 2000 MB." }); return; }
    const now = new Date().toISOString();
    const rows = [
      { key: "publishing_mode", value: v.publishing_mode }, { key: "max_apk_mb", value: mb },
      { key: "store_name", value: v.store_name.trim() || "FAST STORE" }, { key: "announcement", value: v.announcement.trim() },
    ].map((r) => ({ ...r, updated_by: me, updated_at: now }));
    const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "key" });
    if (error) { setMsg({ ok: false, text: "Could not save settings." }); return; }
    await audit(me, "settings.update", "platform_settings", null, null, { publishing_mode: v.publishing_mode, max_apk_mb: mb });
    setMsg({ ok: true, text: "Settings saved." });
  }

  return (
    <Shell title="Platform settings" back={{ to: "/admin", label: "Admin" }}>
      {msg && <p role="status" className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      {!loaded && !msg && <p className="text-slate-500">Loading…</p>}
      <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="font-medium">App publishing mode</p>
        {[["admin_review", "Administrator review", "Every submitted app waits for your approval."],
          ["auto_after_validation", "Automatic after validation", "Approved developers publish after checks pass."]].map(([val, title, desc]) => (
          <label key={val} className="flex gap-3 rounded-xl bg-slate-50 p-3">
            <input type="radio" name="mode" checked={v.publishing_mode === val} onChange={() => setV({ ...v, publishing_mode: val })} />
            <span><span className="block font-medium">{title}</span><span className="text-sm text-slate-500">{desc}</span></span>
          </label>
        ))}
        <p className="text-xs text-slate-400">The chosen mode is stored now and will be applied when app publishing is built.</p>
      </section>
      <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="font-medium">Maximum APK size (MB)</p>
        <input className={fieldCls} type="number" min={1} max={2000} value={v.max_apk_mb} onChange={(e) => setV({ ...v, max_apk_mb: e.target.value })} />
        <p className="text-xs text-slate-400">Supabase&apos;s free plan itself limits uploads to 50 MB per file.</p>
      </section>
      <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
        <p className="font-medium">Store name</p>
        <input className={fieldCls} value={v.store_name} onChange={(e) => setV({ ...v, store_name: e.target.value })} />
        <p className="font-medium">Announcement</p>
        <textarea className={fieldCls} rows={2} placeholder="Optional message for the store" value={v.announcement} onChange={(e) => setV({ ...v, announcement: e.target.value })} />
      </section>
      <button onClick={save} disabled={!loaded} className={btnPrimary}>Save settings</button>
    </Shell>
  );
}
