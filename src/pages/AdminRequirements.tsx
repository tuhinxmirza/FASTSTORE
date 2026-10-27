import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit } from "../lib/admin";
import Shell from "./AdminShell";

type Req = {
  id: string; title: string; instructions: string | null; kind: string; mandatory: boolean;
  accepted_formats: string[]; max_size_mb: number; applies_to: string; enabled: boolean; sort_order: number;
};

const DEFAULTS = [
  { title: "Identity or business document", instructions: "Upload a clear scan or photo of a government ID or business registration.", kind: "document", accepted_formats: ["pdf", "jpg", "jpeg", "png"], max_size_mb: 10 },
  { title: "Test APK", instructions: "Upload a test build (.apk) of an app you own.", kind: "test_apk", accepted_formats: ["apk"], max_size_mb: 50 },
  { title: "Test app name", instructions: null, kind: "field", accepted_formats: [], max_size_mb: 1 },
  { title: "Test app package name (for example com.example.app)", instructions: null, kind: "field", accepted_formats: [], max_size_mb: 1 },
  { title: "Test app version name", instructions: null, kind: "field", accepted_formats: [], max_size_mb: 1 },
  { title: "Short description of the test app", instructions: null, kind: "field", accepted_formats: [], max_size_mb: 1 },
];
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";

export default function AdminRequirements() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", instructions: "", kind: "document", mandatory: true, formats: "pdf,jpg,png", size: 10, applies: "both" });

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("verification_requirement_definitions").select("*").order("sort_order");
    if (e) setError("Could not load requirements."); else { setError(null); setReqs((data as Req[]) ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function insert(rows: object[]) {
    setMsg(null);
    const { error: e } = await supabase.from("verification_requirement_definitions").insert(rows);
    if (e) setError("Could not add the requirement."); else { setMsg("Requirement added."); await load(); }
  }
  const addDefaults = () => insert(DEFAULTS.map((d, i) => ({ ...d, mandatory: true, applies_to: "both", enabled: true, sort_order: i })));
  function addOne() {
    if (!f.title.trim()) { setError("Please enter a title."); return; }
    insert([{
      title: f.title.trim(), instructions: f.instructions.trim() || null, kind: f.kind, mandatory: f.mandatory,
      accepted_formats: f.kind === "field" ? [] : f.formats.split(",").map((x) => x.trim().toLowerCase().replace(/^\./, "")).filter(Boolean),
      max_size_mb: Math.max(1, f.size), applies_to: f.applies, enabled: true, sort_order: reqs?.length ?? 0,
    }]).then(() => setF({ ...f, title: "", instructions: "" }));
  }
  async function toggle(r: Req) {
    const { error: e } = await supabase.from("verification_requirement_definitions").update({ enabled: !r.enabled }).eq("id", r.id);
    if (e) setError("Could not update the requirement."); else load();
  }

  async function remove(r: Req) {
    if (!window.confirm(`Delete "${r.title}"? Existing applications keep their own copy.`)) return;
    const { error: e } = await supabase.from("verification_requirement_definitions").delete().eq("id", r.id);
    if (e) { setError("Could not delete the requirement."); return; }
    await audit(me, "requirement.delete", "verification_requirement", r.id, r.title);
    setMsg("Requirement deleted."); load();
  }

  return (
    <Shell title="Verification requirements">
      <p className="text-sm text-slate-500">Developers see the enabled requirements when they apply. Each submission keeps a copy of the requirements it was made with.</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {msg && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</p>}
      {!reqs && !error && <p className="text-slate-500">Loading…</p>}
      {reqs && reqs.length === 0 && (
        <button onClick={addDefaults} className="rounded-full bg-blue-700 px-6 py-3 font-medium text-white">Add the recommended requirements</button>
      )}
      {reqs?.map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.title}</p>
            <p className="text-xs text-slate-500">
              {r.kind} · {r.mandatory ? "mandatory" : "optional"} · applies to {r.applies_to}
              {r.kind !== "field" && ` · ${r.accepted_formats.join(", ") || "any format"} · max ${r.max_size_mb} MB`}
            </p>
            {r.instructions && <p className="mt-1 text-sm text-slate-600">{r.instructions}</p>}
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button onClick={() => toggle(r)} className={`shrink-0 rounded-full px-3 py-1 text-sm ${r.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            {r.enabled ? "Enabled" : "Disabled"}
          </button>
            <button onClick={() => remove(r)} className="rounded-full bg-red-50 px-3 py-1 text-sm text-red-600">Delete</button>
          </div>
        </div>
      ))}

      <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
        <p className="font-medium">Add a requirement</p>
        <input className={field} placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className={field} rows={2} placeholder="Instructions for the developer" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
        <div className="grid grid-cols-2 gap-3">
          <select className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="document">Document upload</option><option value="test_apk">Test APK</option>
            <option value="screenshot">Screenshot</option><option value="field">Text answer</option>
          </select>
          <select className={field} value={f.applies} onChange={(e) => setF({ ...f, applies: e.target.value })}>
            <option value="both">New and resubmission</option><option value="new">New only</option><option value="resubmission">Resubmission only</option>
          </select>
        </div>
        {f.kind !== "field" && (
          <div className="grid grid-cols-2 gap-3">
            <input className={field} placeholder="Formats, e.g. pdf,jpg" value={f.formats} onChange={(e) => setF({ ...f, formats: e.target.value })} />
            <input className={field} type="number" min={1} value={f.size} onChange={(e) => setF({ ...f, size: Number(e.target.value) })} aria-label="Max size in MB" />
          </div>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mandatory} onChange={(e) => setF({ ...f, mandatory: e.target.checked })} /> Mandatory</label>
        <button onClick={addOne} className="rounded-full bg-blue-700 px-6 py-2.5 font-medium text-white">Add</button>
      </section>
    </Shell>
  );
}
