import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { fieldCls, btn, btnPrimary } from "../lib/admin";
import Shell from "./Shell";

type Cat = { id: string; name: string };
type Ver = { id: string; version_name: string; version_code: number; apk_size_bytes: number };
type Shot = { id: string; storage_path: string };
type Msg = { ok: boolean; text: string } | null;

const PKG = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const EDITABLE = ["draft", "submitted", "pending_review", "unpublished", "rejected"];

async function sha256(f: File) {
  const buf = await f.arrayBuffer();
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const RESERVED = ["tiktok", "whatsapp", "facebook", "instagram", "youtube", "google", "telegram", "messenger", "snapchat", "twitter", "netflix", "spotify", "amazon", "microsoft", "apple", "samsung", "paypal", "bkash", "nagad", "fast store"];

// Basic APK sanity check in the browser: ZIP signature + AndroidManifest.xml + classes.dex in the central directory.
async function inspectApk(file: File): Promise<{ ok: boolean; problem?: string; checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = { zip: false, manifest: false, dex: false };
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  checks.zip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  if (!checks.zip) return { ok: false, problem: "This file is not a valid APK (not a ZIP archive).", checks };
  const tailLen = Math.min(file.size, 65557);
  const tail = new Uint8Array(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) return { ok: false, problem: "The APK file looks damaged (no ZIP directory).", checks };
  const dv = new DataView(tail.buffer);
  const cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff) { checks.manifest = true; checks.dex = true; return { ok: true, checks }; }
  const dir = new TextDecoder("latin1").decode(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  checks.manifest = dir.includes("AndroidManifest.xml");
  checks.dex = dir.includes("classes.dex");
  if (!checks.manifest) return { ok: false, problem: "This is not an Android app: AndroidManifest.xml is missing.", checks };
  if (!checks.dex) return { ok: false, problem: "This APK has no app code (classes.dex is missing).", checks };
  return { ok: true, checks };
}

export default function DeveloperAppEdit() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const nav = useNavigate();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [cats, setCats] = useState<Cat[]>([]);
  const [status, setStatus] = useState("draft");
  const [newIcon, setNewIcon] = useState<File | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [vers, setVers] = useState<Ver[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", pkg: "", cat: "", short: "", full: "" });
  const [v, setV] = useState({ name: "", code: "", sdk: "21", notes: "" });
  const editable = EDITABLE.includes(status);
  const canVersion = editable || status === "published";
  const fail = (t: string) => { setBusy(false); setMsg({ ok: false, text: t }); };

  const load = useCallback(async () => {
    const c = await supabase.from("app_categories").select("id,name").order("sort_order");
    setCats((c.data as Cat[]) ?? []);
    if (isNew) return;
    const { data, error } = await supabase.from("apps").select("*").eq("id", id!).eq("developer_id", uid).maybeSingle();
    if (error || !data) { setMsg({ ok: false, text: "App not found." }); return; }
    setStatus(data.status); setIcon(data.icon_path); setReason(data.decision_reason ?? null);
    setF({ name: data.name, pkg: data.package_name, cat: data.category_id ?? "", short: data.short_description, full: data.full_description ?? "" });
    const [vr, sr] = await Promise.all([
      supabase.from("app_versions").select("id,version_name,version_code,apk_size_bytes").eq("app_id", id!).order("version_code", { ascending: false }),
      supabase.from("app_screenshots").select("id,storage_path").eq("app_id", id!).order("sort_order"),
    ]);
    setVers((vr.data as Ver[]) ?? []); setShots((sr.data as Shot[]) ?? []);
  }, [id, isNew, uid]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!f.name.trim()) return fail("Enter the app name.");
    if (!PKG.test(f.pkg.trim())) return fail("Package name looks invalid (example: com.example.app).");
    if (!f.short.trim() || f.short.length > 80) return fail("Short description is required (max 80 characters).");
    const low = f.name.trim().toLowerCase();
    if (RESERVED.some((b) => low === b || low.startsWith(b + " "))) return fail("This name belongs to a well-known brand and is reserved. Please choose your own app name.");
    const dup = await supabase.from("apps").select("id").ilike("name", f.name.trim()).eq("status", "published").neq("developer_id", uid).limit(1);
    if (dup.data?.length) return fail("A published app with this name already exists. Please choose a different name.");
    setBusy(true); setMsg(null);
    const row = { name: f.name.trim(), package_name: f.pkg.trim(), category_id: f.cat || null, short_description: f.short.trim(), full_description: f.full.trim() || null, updated_at: new Date().toISOString() };
    if (isNew) {
      const { data, error } = await supabase.from("apps").insert({ ...row, developer_id: uid, status: "draft", slug: `${slugify(f.name) || "app"}-${Math.random().toString(36).slice(2, 6)}` }).select("id").single();
      if (error) return fail(error.code === "23505" ? "This package name is already used." : "Could not create the app.");
      if (newIcon) {
        const path = `${uid}/${data.id}-${Date.now()}.${newIcon.name.split(".").pop()}`;
        const up = await supabase.storage.from("app-icons").upload(path, newIcon, { contentType: newIcon.type });
        if (!up.error) await supabase.from("apps").update({ icon_path: path }).eq("id", data.id);
      }
      setBusy(false); nav(`/developer/apps/${data.id}`, { replace: true });
    } else {
      const { error } = await supabase.from("apps").update(row).eq("id", id!);
      if (error) return fail("Could not save changes.");
      setBusy(false); setMsg({ ok: true, text: "Saved." });
    }
  }

  async function uploadIcon(file?: File) {
    if (!file || isNew) return;
    setBusy(true);
    const path = `${uid}/${id}-${Date.now()}.${file.name.split(".").pop()}`;
    const up = await supabase.storage.from("app-icons").upload(path, file, { contentType: file.type });
    if (up.error) return fail("Icon upload failed.");
    const { error } = await supabase.from("apps").update({ icon_path: path }).eq("id", id!);
    if (error) return fail("Icon uploaded but could not be saved.");
    setBusy(false); setMsg({ ok: true, text: "Icon updated." }); load();
  }

  async function uploadShots(files: FileList | null) {
    if (!files || isNew) return;
    if (shots.length + files.length > 8) return fail("Maximum 8 screenshots.");
    setBusy(true);
    let order = shots.length;
    for (const file of Array.from(files)) {
      const path = `${uid}/${id}-${Date.now()}-${order}.${file.name.split(".").pop()}`;
      const up = await supabase.storage.from("app-screenshots").upload(path, file, { contentType: file.type });
      if (up.error) return fail("Screenshot upload failed.");
      const { error } = await supabase.from("app_screenshots").insert({ app_id: id, storage_path: path, sort_order: order++ });
      if (error) return fail("Screenshot could not be saved.");
    }
    setBusy(false); setMsg({ ok: true, text: "Screenshots added." }); load();
  }
  async function removeShot(s: Shot) {
    const { error } = await supabase.from("app_screenshots").delete().eq("id", s.id);
    if (error) setMsg({ ok: false, text: "Could not remove the screenshot." }); else load();
  }

  async function uploadApk(file?: File) {
    if (!file || isNew) return;
    if (!editable && status !== "published") return fail("This app cannot receive a new version right now.");
    const code = Number(v.code);
    if (!file.name.toLowerCase().endsWith(".apk")) return fail("Please choose an .apk file.");
    if (!v.name.trim() || !Number.isInteger(code) || code < 1) return fail("Enter version name and a whole-number version code.");
    const { data: s } = await supabase.from("platform_settings").select("value").eq("key", "max_apk_mb").maybeSingle();
    const max = Number(s?.value ?? 200);
    if (file.size > max * 1048576) return fail(`APK is larger than the ${max} MB limit.`);
    if (vers.length && code <= vers[0].version_code) return fail(`Version code must be higher than the latest one (${vers[0].version_code}).`);
    setBusy(true); setMsg(null);
    const insp = await inspectApk(file);
    if (!insp.ok) return fail(insp.problem ?? "Invalid APK.");
    const hash = await sha256(file);
    const path = `${uid}/${id}/${code}.apk`;
    const up = await supabase.storage.from("published-apks").upload(path, file, { contentType: "application/vnd.android.package-archive", upsert: false });
    if (up.error) return fail(up.error.message.includes("exists") ? "This version code was already uploaded." : "APK upload failed.");
    const ins = await supabase.from("app_versions").insert({
      app_id: id, version_name: v.name.trim(), version_code: code, min_android_sdk: Number(v.sdk) || 21,
      apk_path: path, apk_size_bytes: file.size, apk_sha256: hash, release_notes: v.notes.trim() || null, is_current: true,
      validation: { ...insp.checks, checked_at: new Date().toISOString() },
    }).select("id").single();
    if (ins.error) return fail("APK uploaded but the version could not be saved.");
    await supabase.from("app_versions").update({ is_current: false }).eq("app_id", id!).neq("id", ins.data.id);
    if (status === "published") {
      const r = await supabase.from("apps").update({ status: "pending_review", decision_reason: null }).eq("id", id!);
      if (!r.error) setStatus("pending_review");
    }
    setBusy(false); setV({ name: "", code: "", sdk: "21", notes: "" }); setMsg({ ok: true, text: "Version uploaded." }); load();
  }

  async function submit() {
    if (!vers.length) return fail("Upload an APK first.");
    if (!icon) return fail("Upload an app icon first.");
    if (!shots.length) return fail("Add at least one screenshot.");
    if (!window.confirm("Submit this app for review?")) return;
    setBusy(true);
    const { error } = await supabase.from("apps").update({ status: "pending_review", decision_reason: null }).eq("id", id!);
    if (error) return fail("Could not submit the app.");
    setBusy(false); setStatus("pending_review"); setMsg({ ok: true, text: "Submitted. An administrator will review it." });
  }

  return (
    <Shell title={isNew ? "New app" : f.name || "App"} back={{ to: "/developer/apps", label: "My apps" }}>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      {!isNew && reason && ["rejected", "suspended"].includes(status) && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700"><b>Administrator note:</b> {reason}</p>}
      {!isNew && <p className="text-sm text-slate-500">Status: <b>{status.replace("_", " ")}</b></p>}

      <section className="space-y-3">
        <input className={fieldCls} placeholder="App name" disabled={!editable} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={fieldCls} placeholder="Package name (com.example.app)" disabled={!isNew} value={f.pkg} onChange={(e) => setF({ ...f, pkg: e.target.value })} />
        <select className={fieldCls} disabled={!editable} value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
          <option value="">Category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input className={fieldCls} maxLength={80} placeholder="Short description (max 80)" disabled={!editable} value={f.short} onChange={(e) => setF({ ...f, short: e.target.value })} />
        <textarea className={fieldCls} rows={5} placeholder="Full description" disabled={!editable} value={f.full} onChange={(e) => setF({ ...f, full: e.target.value })} />
        {isNew && (
          <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <p className="font-medium">App icon</p>
            {newIcon && <img src={URL.createObjectURL(newIcon)} alt="Icon preview" className="h-20 w-20 rounded-2xl border border-slate-200 object-cover" />}
            <label className="inline-block cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm font-medium">
              {newIcon ? "Change icon" : "Choose icon"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { setNewIcon(e.target.files?.[0] ?? null); e.target.value = ""; }} />
            </label>
            <p className="text-xs text-slate-500">Square PNG or JPG, 512×512 recommended.</p>
          </div>
        )}
        {editable && <button disabled={busy} onClick={save} className={btnPrimary}>{isNew ? "Create app" : "Save details"}</button>}
      </section>

      {!isNew && (
        <>
          <section className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <p className="font-medium">App icon {icon ? "✓" : "(required)"}</p>
            {icon && <img src={supabase.storage.from("app-icons").getPublicUrl(icon).data.publicUrl} alt="App icon" className="h-20 w-20 rounded-2xl border border-slate-200 object-cover" />}
            <label className={`inline-block rounded-full border border-slate-300 px-4 py-2 text-sm font-medium ${busy || !editable ? "opacity-50" : "cursor-pointer"}`}>
              {icon ? "Change icon" : "Choose icon"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy || !editable} onChange={(e) => { uploadIcon(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </section>

          <section className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <p className="font-medium">Screenshots ({shots.length}/8)</p>
            <div className="flex flex-wrap gap-2">
              {shots.map((s) => (
                <div key={s.id} className="relative">
                  <img src={supabase.storage.from("app-screenshots").getPublicUrl(s.storage_path).data.publicUrl} alt="" className="h-28 rounded-lg border border-slate-200" />
                  {editable && <button onClick={() => removeShot(s)} aria-label="Remove" className="absolute right-1 top-1 rounded-full bg-white/90 px-2 text-sm">×</button>}
                </div>
              ))}
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || !editable} onChange={(e) => { uploadShots(e.target.files); e.target.value = ""; }} className="text-sm" />
          </section>

          <section className="space-y-2 rounded-2xl bg-slate-50 p-4">
            <p className="font-medium">Versions</p>
            {status === "published" && <p className="text-xs text-amber-700">Uploading a new version sends the app back to admin review before users get the update.</p>}
            {vers.map((x) => <p key={x.id} className="text-sm text-slate-600">{x.version_name} (code {x.version_code}) · {(x.apk_size_bytes / 1048576).toFixed(1)} MB</p>)}
            <div className="grid grid-cols-3 gap-2">
              <input className={fieldCls} placeholder="Version name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
              <input className={fieldCls} inputMode="numeric" placeholder="Code" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} />
              <input className={fieldCls} inputMode="numeric" placeholder="Min SDK" value={v.sdk} onChange={(e) => setV({ ...v, sdk: e.target.value })} />
            </div>
            <textarea className={fieldCls} rows={2} placeholder="Release notes (optional)" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
            <input type="file" accept=".apk" disabled={busy || !canVersion} onChange={(e) => { uploadApk(e.target.files?.[0]); e.target.value = ""; }} className="text-sm" />
            <p className="text-xs text-slate-500">Fill the version fields first, then choose the APK. Upload starts immediately.</p>
          </section>

          {editable && status !== "pending_review" && <button disabled={busy} onClick={submit} className={btnPrimary}>Submit for review</button>}
          {status === "pending_review" && <p className={btn + " inline-block"}>Waiting for admin review</p>}
        </>
      )}
    </Shell>
  );
}
