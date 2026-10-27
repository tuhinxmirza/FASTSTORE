import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import Shell from "./Shell";

type Req = {
  id: string; title: string; instructions: string | null; kind: string; mandatory: boolean;
  accepted_formats: string[]; max_size_mb: number; applies_to: string; sort_order: number;
};
type VApp = { id: string; status: string; answers: Record<string, string> };
type Doc = { id: string; requirement_id: string; original_name: string; size_bytes: number };

const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";

export default function DeveloperVerification() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const [reqs, setReqs] = useState<Req[]>([]);
  const [vapp, setVapp] = useState<VApp | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "form" | "locked" | "nodev" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadDocs = useCallback(async (appId: string) => {
    const { data } = await supabase.from("verification_documents")
      .select("id,requirement_id,original_name,size_bytes").eq("application_id", appId).order("created_at", { ascending: false });
    setDocs((data as Doc[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: dev } = await supabase.from("developer_profiles").select("id,status").eq("id", uid).maybeSingle();
      if (!dev) { setState("nodev"); return; }
      const { data: latest } = await supabase.from("developer_verification_applications").select("id,status,answers")
        .eq("developer_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle();
      let cur = latest as VApp | null;
      if (dev.status === "approved" || dev.status === "suspended" || (cur && !["incomplete", "changes_requested"].includes(cur.status))) {
        setState("locked"); return;
      }
      const resub = cur?.status === "changes_requested";
      const { data: r, error: re } = await supabase.from("verification_requirement_definitions").select("*")
        .eq("enabled", true).in("applies_to", ["both", resub ? "resubmission" : "new"]).order("sort_order");
      if (re) { setState("error"); return; }
      const list = (r as Req[]) ?? [];
      if (!cur) {
        const { data: created, error: ce } = await supabase.from("developer_verification_applications")
          .insert({ developer_id: uid, status: "incomplete", requirement_snapshot: list, answers: {} }).select("id,status,answers").single();
        if (ce) { setState("error"); return; }
        cur = created as VApp;
      }
      setReqs(list); setVapp(cur); setAnswers(cur.answers ?? {});
      await loadDocs(cur.id);
      setState("form");
    })();
  }, [uid, loadDocs]);

  const hasDoc = (id: string) => docs.some((d) => d.requirement_id === id);

  async function saveAnswers(showMsg = true) {
    if (!vapp) return false;
    const { error } = await supabase.from("developer_verification_applications").update({ answers }).eq("id", vapp.id);
    if (error) { setMsg({ ok: false, text: "Could not save your answers." }); return false; }
    if (showMsg) setMsg({ ok: true, text: "Saved." });
    return true;
  }

  async function upload(r: Req, file: File | undefined) {
    if (!file || !vapp) return;
    setMsg(null);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (r.accepted_formats.length && !r.accepted_formats.includes(ext)) { setMsg({ ok: false, text: `${r.title}: allowed formats are ${r.accepted_formats.join(", ")}.` }); return; }
    if (file.size > r.max_size_mb * 1048576) { setMsg({ ok: false, text: `${r.title}: file is larger than ${r.max_size_mb} MB.` }); return; }
    if (r.kind === "test_apk") {
      const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      if (head[0] !== 0x50 || head[1] !== 0x4b) { setMsg({ ok: false, text: "This file is not a valid APK (it is not a zip package)." }); return; }
    }
    setBusy(r.id);
    const bucket = r.kind === "test_apk" ? "test-apks" : "verification-docs";
    const path = `${uid}/${vapp.id}/${r.id}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || undefined });
    if (up.error) { setBusy(null); setMsg({ ok: false, text: "Upload failed. Check your connection and try again." }); return; }
    const { error } = await supabase.from("verification_documents").insert({
      application_id: vapp.id, requirement_id: r.id, storage_path: path, original_name: file.name, size_bytes: file.size, mime_type: file.type || null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: "The file was uploaded but could not be recorded. Please try again." }); return; }
    setMsg({ ok: true, text: `${r.title}: uploaded.` });
    await loadDocs(vapp.id);
  }

  async function submit() {
    if (!vapp) return;
    const missing = reqs.filter((r) => r.mandatory && (r.kind === "field" ? !(answers[r.id] ?? "").trim() : !hasDoc(r.id)));
    if (missing.length) { setMsg({ ok: false, text: `Still required: ${missing.map((m) => m.title).join(", ")}.` }); return; }
    setBusy("submit");
    const { error } = await supabase.from("developer_verification_applications").update({
      answers, status: "submitted", submitted_at: new Date().toISOString(), requirement_snapshot: reqs,
    }).eq("id", vapp.id);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: "Could not submit your application." }); return; }
    setState("locked");
  }

  const back = { to: "/developer", label: "Dashboard" };
  if (state === "loading") return <Shell title="Verification" back={back}><p className="text-slate-500">Loading…</p></Shell>;
  if (state === "error") return <Shell title="Verification" back={back}><p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Could not load the verification form. Please try again.</p></Shell>;
  if (state === "nodev") return <Shell title="Verification" back={back}><p>Please <Link to="/developer" className="text-blue-700 underline">create your developer profile</Link> first.</p></Shell>;
  if (state === "locked") return <Shell title="Verification" back={back}><p className="rounded-3xl bg-slate-50 p-6">Your application cannot be edited right now. Check its status on your dashboard.</p></Shell>;

  return (
    <Shell title="Developer verification" back={back}>
      {reqs.length === 0 && <p className="rounded-3xl bg-slate-50 p-6 text-slate-600">The administrator has not set up verification requirements yet. Please check back later.</p>}
      {msg && <p role="status" className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}

      {reqs.map((r) => (
        <section key={r.id} className="rounded-2xl border border-slate-200 p-4">
          <p className="font-medium">{r.title} {r.mandatory ? <span className="text-red-600">*</span> : <span className="text-xs text-slate-400">(optional)</span>}</p>
          {r.instructions && <p className="mt-1 text-sm text-slate-500">{r.instructions}</p>}
          {r.kind === "field" ? (
            <input className={`${field} mt-3`} value={answers[r.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [r.id]: e.target.value })} />
          ) : (
            <div className="mt-3">
              <input type="file" disabled={busy === r.id} accept={r.accepted_formats.map((x) => `.${x}`).join(",")}
                onChange={(e) => { upload(r, e.target.files?.[0]); e.target.value = ""; }} className="text-sm" />
              <p className="mt-1 text-xs text-slate-400">Allowed: {r.accepted_formats.join(", ") || "any"} · max {r.max_size_mb} MB</p>
              {busy === r.id && <p className="mt-1 text-sm text-blue-700">Uploading… please wait.</p>}
              {docs.filter((d) => d.requirement_id === r.id).slice(0, 1).map((d) => (
                <p key={d.id} className="mt-2 text-sm text-emerald-700">✓ {d.original_name} ({(d.size_bytes / 1048576).toFixed(1)} MB)</p>
              ))}
            </div>
          )}
        </section>
      ))}

      {reqs.length > 0 && (
        <div className="flex gap-3">
          <button onClick={() => saveAnswers()} disabled={busy !== null} className="rounded-full border border-slate-300 px-6 py-3 font-medium text-blue-700">Save</button>
          <button onClick={submit} disabled={busy !== null} className="flex-1 rounded-full bg-blue-700 py-3 font-medium text-white disabled:opacity-50">
            {busy === "submit" ? "Submitting…" : "Submit for review"}
          </button>
        </div>
      )}
    </Shell>
  );
}
