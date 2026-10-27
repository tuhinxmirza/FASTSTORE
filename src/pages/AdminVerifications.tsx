import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, notify, fieldCls, btn, btnDanger, btnPrimary } from "../lib/admin";
import Shell from "./Shell";

type Snap = { id: string; title: string; kind: string };
type Row = {
  id: string; developer_id: string; status: string; submitted_at: string | null; decision_reason: string | null;
  answers: Record<string, string>; requirement_snapshot: Snap[];
  developer_profiles: { display_name: string; legal_name: string; country: string; account_type: string } | null;
};
type Doc = { id: string; requirement_id: string; storage_path: string; original_name: string; size_bytes: number };
type Decision = "approved" | "rejected" | "changes_requested";

export default function AdminVerifications() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"waiting" | "all">("waiting");
  const [sel, setSel] = useState<Row | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("developer_verification_applications")
      .select("*, developer_profiles(display_name,legal_name,country,account_type)")
      .neq("status", "incomplete").order("submitted_at", { ascending: false, nullsFirst: false });
    if (error) setMsg({ ok: false, text: "Could not load applications." }); else setRows((data as unknown as Row[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function open(r: Row) {
    setSel(r); setReason(""); setMsg(null);
    const { data } = await supabase.from("verification_documents").select("id,requirement_id,storage_path,original_name,size_bytes")
      .eq("application_id", r.id).order("created_at", { ascending: false });
    setDocs((data as Doc[]) ?? []);
    if (r.status === "submitted") {
      const { error } = await supabase.from("developer_verification_applications").update({ status: "under_review" }).eq("id", r.id);
      if (!error) { setSel({ ...r, status: "under_review" }); load(); }
    }
  }

  async function openDoc(d: Doc) {
    const kind = sel?.requirement_snapshot.find((s) => s.id === d.requirement_id)?.kind;
    const { data, error } = await supabase.storage.from(kind === "test_apk" ? "test-apks" : "verification-docs").createSignedUrl(d.storage_path, 120);
    if (error || !data) setMsg({ ok: false, text: "Could not open the file." }); else window.open(data.signedUrl, "_blank", "noopener");
  }

  async function decide(action: Decision) {
    if (!sel) return;
    if (action !== "approved" && !reason.trim()) { setMsg({ ok: false, text: "Please write a reason for the developer." }); return; }
    if (!window.confirm(`Are you sure you want to ${action.replace("_", " ")} this application?`)) return;
    setBusy(true); setMsg(null);
    const now = new Date().toISOString();
    const fail = (t: string) => { setBusy(false); setMsg({ ok: false, text: t }); };

    const a = await supabase.from("developer_verification_applications")
      .update({ status: action, decision_by: me, decision_reason: reason.trim() || null, decided_at: now }).eq("id", sel.id);
    if (a.error) return fail("Could not save the decision.");
    const p = await supabase.from("developer_profiles").update({ status: action }).eq("id", sel.developer_id);
    if (p.error) return fail("Decision saved, but the developer profile could not be updated.");

    if (action === "approved") {
      const g = await supabase.from("developer_permissions").upsert(
        { developer_id: sel.developer_id, can_publish: true, granted_by: me, granted_at: now, revoked_at: null, reason: reason.trim() || null },
        { onConflict: "developer_id" });
      if (g.error) return fail("Approved, but publishing permission could not be granted.");
    } else if (action === "rejected") {
      await supabase.from("developer_permissions").upsert(
        { developer_id: sel.developer_id, can_publish: false, revoked_at: now, reason: reason.trim() || null }, { onConflict: "developer_id" });
    }

    const titles: Record<Decision, string> = {
      approved: "Your developer application was approved",
      rejected: "Your developer application was rejected",
      changes_requested: "Changes requested for your developer application",
    };
    await notify(sel.developer_id, `verification_${action}`, titles[action],
      action === "approved" ? "You can now publish apps on FAST STORE." : reason.trim());
    await audit(me, `verification.${action}`, "verification_application", sel.id, reason.trim() || null);
    setBusy(false); setSel(null); setMsg({ ok: true, text: "Decision saved and the developer was notified." }); load();
  }

  const shown = (rows ?? []).filter((r) => filter === "all" || ["submitted", "under_review"].includes(r.status));
  const back = { to: "/admin", label: "Admin" };

  if (sel) {
    const d = sel.developer_profiles;
    return (
      <Shell title="Review application" back={back}>
        <button onClick={() => setSel(null)} className={btn}>← All applications</button>
        {msg && <p role="status" className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
        <section className="rounded-2xl border border-slate-200 p-4">
          <p className="text-lg font-medium">{d?.display_name}</p>
          <p className="text-sm text-slate-500">{d?.legal_name} · {d?.account_type} · {d?.country}</p>
          <p className="mt-1 text-xs text-slate-400">Status: {sel.status.replace("_", " ")} · Developer ID {sel.developer_id}</p>
        </section>
        <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
          <p className="font-medium">Answers</p>
          {sel.requirement_snapshot.filter((s) => s.kind === "field").map((s) => (
            <p key={s.id} className="text-sm"><span className="text-slate-500">{s.title}:</span> {sel.answers[s.id] || "—"}</p>
          ))}
        </section>
        <section className="space-y-2 rounded-2xl border border-slate-200 p-4">
          <p className="font-medium">Uploaded files</p>
          {docs.length === 0 && <p className="text-sm text-slate-500">No files uploaded.</p>}
          {docs.map((f) => (
            <div key={f.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{sel.requirement_snapshot.find((s) => s.id === f.requirement_id)?.title}: {f.original_name} ({(f.size_bytes / 1048576).toFixed(1)} MB)</span>
              <button onClick={() => openDoc(f)} className={btn}>Open</button>
            </div>
          ))}
          <p className="text-xs text-slate-400">Files open through a link that expires in 2 minutes. Test APKs have not been scanned for malware.</p>
        </section>
        <section className="space-y-3 rounded-2xl bg-slate-50 p-4">
          <textarea className={fieldCls} rows={3} placeholder="Reason / note for the developer (required to reject or request changes)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => decide("approved")} className={btnPrimary}>Approve</button>
            <button disabled={busy} onClick={() => decide("changes_requested")} className={btn}>Request changes</button>
            <button disabled={busy} onClick={() => decide("rejected")} className={btnDanger}>Reject</button>
          </div>
        </section>
      </Shell>
    );
  }

  return (
    <Shell title="Verifications" back={back}>
      <div className="flex gap-2">
        {(["waiting", "all"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-4 py-1.5 text-sm ${filter === k ? "bg-blue-50 text-blue-700" : "bg-slate-100"}`}>{k === "waiting" ? "Waiting for review" : "All"}</button>
        ))}
      </div>
      {msg && <p role="status" className={`rounded-xl p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{msg.text}</p>}
      {!rows && <p className="text-slate-500">Loading…</p>}
      {rows && shown.length === 0 && <p className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">No applications here.</p>}
      {shown.map((r) => (
        <button key={r.id} onClick={() => open(r)} className="block w-full rounded-2xl border border-slate-200 p-4 text-left">
          <p className="font-medium">{r.developer_profiles?.display_name}</p>
          <p className="text-sm text-slate-500">{r.status.replace("_", " ")} · {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "not submitted"}</p>
        </button>
      ))}
    </Shell>
  );
}
