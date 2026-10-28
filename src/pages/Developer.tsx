import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import Shell from "./Shell";

type Dev = { id: string; legal_name: string; display_name: string; account_type: string; country: string; status: string; description: string | null };
type VApp = { id: string; status: string; decision_reason: string | null };

const STATUS: Record<string, { text: string; cls: string; next: string }> = {
  not_started: { text: "Not started", cls: "bg-slate-100 text-slate-700", next: "Start your verification to get publishing access." },
  incomplete: { text: "Incomplete", cls: "bg-amber-50 text-amber-800", next: "Finish your verification form and submit it." },
  submitted: { text: "Submitted", cls: "bg-blue-50 text-blue-700", next: "Your application is waiting for review. We will notify you." },
  under_review: { text: "Under review", cls: "bg-blue-50 text-blue-700", next: "An administrator is reviewing your application." },
  changes_requested: { text: "Changes requested", cls: "bg-amber-50 text-amber-800", next: "Update your application as described below and submit again." },
  approved: { text: "Approved", cls: "bg-emerald-50 text-emerald-700", next: "You are verified. You can now publish apps." },
  rejected: { text: "Rejected", cls: "bg-red-50 text-red-600", next: "Your application was rejected. See the reason below." },
  suspended: { text: "Suspended", cls: "bg-red-50 text-red-600", next: "Your developer account is suspended." },
};
const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";

export default function Developer() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const [dev, setDev] = useState<Dev | null | undefined>(undefined);
  const [vapp, setVapp] = useState<VApp | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [e, setE] = useState({ display: "", country: "", desc: "" });
  const [f, setF] = useState({ legal: "", display: "", type: "individual", country: "", desc: "" });

  const load = useCallback(async () => {
    const { data: d, error: e } = await supabase.from("developer_profiles").select("*").eq("id", uid).maybeSingle();
    if (e) { setError("Could not load your developer profile."); return; }
    setDev((d as Dev | null) ?? null);
    if (d) {
      const [a, p] = await Promise.all([
        supabase.from("developer_verification_applications").select("id,status,decision_reason")
          .eq("developer_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("developer_permissions").select("can_publish,revoked_at").eq("developer_id", uid).maybeSingle(),
      ]);
      setVapp((a.data as VApp | null) ?? null);
      const perm = p.data as { can_publish: boolean; revoked_at: string | null } | null;
      setCanPublish(Boolean(perm?.can_publish && !perm.revoked_at));
    }
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  async function register() {
    if (!f.legal.trim() || !f.display.trim() || !f.country.trim()) { setError("Please fill in legal name, display name and country."); return; }
    setBusy(true); setError(null);
    const { error: e } = await supabase.from("developer_profiles").insert({
      id: uid, legal_name: f.legal.trim(), display_name: f.display.trim(),
      account_type: f.type, country: f.country.trim(), description: f.desc.trim() || null, status: "not_started",
    });
    setBusy(false);
    if (e) setError("Could not create your developer profile."); else load();
  }

  async function saveProfile() {
    if (!e.display.trim() || !e.country.trim()) { setError("Display name and country are required."); return; }
    setBusy(true); setError(null); setMsg(null);
    const { error: er } = await supabase.from("developer_profiles")
      .update({ display_name: e.display.trim(), country: e.country.trim(), description: e.desc.trim() || null }).eq("id", uid);
    setBusy(false);
    if (er) { setError("Could not save your profile."); return; }
    setEditing(false); setMsg("Profile updated."); load();
  }

  if (dev === undefined && !error) return <Shell title="Developer Console" back={{ to: "/", label: "Store" }}><p className="text-slate-500">Loading…</p></Shell>;

  if (dev === null || dev === undefined) {
    return (
      <Shell title="Become a developer" back={{ to: "/", label: "Store" }}>
        <p className="text-slate-600">Tell us about yourself. You can publish apps after an administrator verifies you.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="space-y-3">
          <input className={field} placeholder="Legal name" value={f.legal} onChange={(e) => setF({ ...f, legal: e.target.value })} />
          <input className={field} placeholder="Developer display name (shown in the store)" value={f.display} onChange={(e) => setF({ ...f, display: e.target.value })} />
          <select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            <option value="individual">Individual</option><option value="organization">Organization</option>
          </select>
          <input className={field} placeholder="Country or region" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} />
          <input className={`${field} bg-slate-50`} value={session!.user.email ?? ""} readOnly aria-label="Verified Gmail" />
          <textarea className={field} rows={3} placeholder="About you or your team (optional)" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
          <button onClick={register} disabled={busy} className="w-full rounded-full bg-blue-700 py-3 font-medium text-white disabled:opacity-50">
            {busy ? "Please wait…" : "Create developer profile"}
          </button>
        </div>
      </Shell>
    );
  }

  const status = dev.status === "approved" || dev.status === "suspended" ? dev.status : (vapp?.status ?? "not_started");
  const s = STATUS[status] ?? STATUS.not_started;
  const canEdit = ["not_started", "incomplete", "changes_requested"].includes(status);

  return (
    <Shell title="Developer Console" back={{ to: "/", label: "Store" }}>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <section className="rounded-3xl border border-slate-200 p-5">
        <p className="text-xl font-medium">{dev.display_name}</p>
        <p className="text-sm text-slate-500">{dev.legal_name} · {dev.account_type} · {dev.country}</p>
        <p className="mt-1 text-xs text-slate-400">Developer ID: {dev.id}</p>
        {dev.description && <p className="mt-2 text-sm text-slate-600">{dev.description}</p>}
        {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
        <button onClick={() => { setE({ display: dev.display_name, country: dev.country, desc: dev.description ?? "" }); setEditing(!editing); }}
          className="mt-3 rounded-full border border-slate-300 px-4 py-1.5 text-sm">{editing ? "Cancel" : "Edit profile"}</button>
        {editing && (
          <div className="mt-3 space-y-3">
            <input className={field} placeholder="Developer display name" value={e.display} onChange={(x) => setE({ ...e, display: x.target.value })} />
            <input className={field} placeholder="Country or region" value={e.country} onChange={(x) => setE({ ...e, country: x.target.value })} />
            <textarea className={field} rows={3} placeholder="About you or your team" value={e.desc} onChange={(x) => setE({ ...e, desc: x.target.value })} />
            <p className="text-xs text-slate-500">Legal name and account type cannot be changed after registration. Contact support if needed.</p>
            <button onClick={saveProfile} disabled={busy} className="rounded-full bg-blue-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">Save profile</button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 ${s.cls}`}>Verification: {s.text}</span>
          <span className={`rounded-full px-3 py-1 ${canPublish ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
            Publishing: {canPublish ? "Allowed" : "Not allowed"}
          </span>
        </div>
      </section>

      <section className="rounded-3xl bg-slate-50 p-5">
        <p className="font-medium">What to do next</p>
        <p className="mt-1 text-slate-600">{s.next}</p>
        {vapp?.decision_reason && ["changes_requested", "rejected"].includes(status) && (
          <p className="mt-3 rounded-xl bg-white p-3 text-sm text-slate-700"><b>Administrator note:</b> {vapp.decision_reason}</p>
        )}
        {canPublish && (
          <Link to="/developer/apps" className="mt-4 inline-block rounded-full bg-blue-700 px-6 py-2.5 font-medium text-white">My apps</Link>
        )}
        {canEdit && (
          <Link to="/developer/verification" className="mt-4 inline-block rounded-full bg-blue-700 px-6 py-2.5 font-medium text-white">
            {status === "changes_requested" ? "Update application" : status === "incomplete" ? "Continue verification" : "Start verification"}
          </Link>
        )}
      </section>
    </Shell>
  );
}
