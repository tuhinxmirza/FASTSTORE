import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { AppIcon, TopBar } from "./Home";

// Name of the download function in Supabase (Edge Functions page). Change here if yours differs.
const DOWNLOAD_FN = "rapid-endpoint";

type Detail = {
  id: string; slug: string; name: string; short_description: string; full_description: string | null;
  icon_path: string | null; category_id: string | null;
  developer_profiles: { display_name: string } | null; app_categories: { name: string } | null;
};
type Version = {
  version_name: string; min_android_sdk: number; apk_size_bytes: number; release_notes: string | null; created_at: string;
};
type Stats = { downloads: number; rating_avg: number | null; rating_count: number };
type Review = { id: string; user_id: string; rating: number; body: string | null; created_at: string };

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default function AppDetail() {
  const { slug } = useParams();
  const { session } = useAuth();
  const [app, setApp] = useState<Detail | null>(null);
  const [version, setVersion] = useState<Version | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [myRating, setMyRating] = useState(0);
  const [myText, setMyText] = useState("");

  const loadExtras = useCallback(async (id: string) => {
    const [s, r] = await Promise.all([
      supabase.rpc("get_app_stats", { p_app: id }),
      supabase.from("app_reviews").select("id,user_id,rating,body,created_at").eq("app_id", id)
        .order("created_at", { ascending: false }).limit(30),
    ]);
    const row = (s.data as Stats[] | null)?.[0];
    setStats(row ? { downloads: Number(row.downloads), rating_avg: row.rating_avg === null ? null : Number(row.rating_avg), rating_count: Number(row.rating_count) } : null);
    setReviews((r.data as Review[]) ?? []);
  }, []);

  useEffect(() => {
    let stale = false;
    setState("loading");
    (async () => {
      const { data, error } = await supabase.from("apps")
        .select("id,slug,name,short_description,full_description,icon_path,category_id,developer_profiles(display_name),app_categories(name)")
        .eq("slug", slug ?? "").eq("status", "published").maybeSingle();
      if (stale) return;
      if (error) { setState("error"); return; }
      if (!data) { setState("missing"); return; }
      const a = data as unknown as Detail;
      setApp(a);
      const [v, sh] = await Promise.all([
        supabase.from("app_versions").select("version_name,min_android_sdk,apk_size_bytes,release_notes,created_at")
          .eq("app_id", a.id).order("is_current", { ascending: false }).order("version_code", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("app_screenshots").select("storage_path").eq("app_id", a.id).order("sort_order"),
      ]);
      if (stale) return;
      setVersion((v.data as Version | null) ?? null);
      setShots(((sh.data as { storage_path: string }[]) ?? []).map((x) => supabase.storage.from("app-screenshots").getPublicUrl(x.storage_path).data.publicUrl));
      await loadExtras(a.id);
      if (!stale) setState("ready");
    })();
    return () => { stale = true; };
  }, [slug, loadExtras]);

  const mine = reviews.find((r) => r.user_id === session?.user.id);
  useEffect(() => { setMyRating(mine?.rating ?? 0); setMyText(mine?.body ?? ""); }, [mine?.id]);

  async function download() {
    setBusy(true); setNote(null);
    const { data, error } = await supabase.functions.invoke<{ url?: string }>(DOWNLOAD_FN, { body: { slug } });
    setBusy(false);
    if (error || !data?.url) {
      let text = "Download is not available right now.";
      try { const b = await (error as any).context.json(); if (b?.error) text = b.error; } catch { /* keep default */ }
      setNote({ ok: false, text });
      return;
    }
    setNote({ ok: true, text: "Your download is starting…" });
    window.location.href = data.url;
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: app?.name, url });
      else { await navigator.clipboard.writeText(url); setNote({ ok: true, text: "Link copied." }); }
    } catch { /* cancelled */ }
  }

  async function submitReview() {
    if (!app || !session || myRating < 1) return;
    setBusy(true);
    const { error } = await supabase.from("app_reviews").upsert(
      { app_id: app.id, user_id: session.user.id, rating: myRating, body: myText.trim() || null },
      { onConflict: "app_id,user_id" });
    setBusy(false);
    if (error) setNote({ ok: false, text: "Could not save your review." });
    else { setNote({ ok: true, text: "Thanks for your review!" }); await loadExtras(app.id); }
  }

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-white text-slate-900"><TopBar /><main className="mx-auto max-w-3xl px-4 pb-8">{children}</main></div>
  );

  if (state === "loading") return shell(<p className="text-slate-500">Loading…</p>);
  if (state === "error") return shell(<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Could not load this app. Please try again.</p>);
  if (state === "missing" || !app) return shell(
    <div className="rounded-3xl bg-slate-50 p-10 text-center">
      <p className="text-lg font-medium">App not found</p>
      <Link to="/" className="mt-3 inline-block text-blue-700 underline">Back to store</Link>
    </div>);

  return shell(
    <>
      <div className="flex gap-4">
        <AppIcon a={app} size="h-24 w-24" />
        <div className="min-w-0">
          <h1 className="text-2xl font-medium">{app.name}</h1>
          <p className="truncate font-medium text-blue-700">{app.developer_profiles?.display_name}</p>
          <p className="text-sm text-slate-500">{app.app_categories?.name}</p>
        </div>
      </div>

      <div className="my-5 flex divide-x divide-slate-200 text-center">
        <div className="flex-1 px-2">
          <p className="font-medium">{stats?.rating_avg ? `${stats.rating_avg} ★` : "—"}</p>
          <p className="text-xs text-slate-500">{stats?.rating_count ?? 0} reviews</p>
        </div>
        <div className="flex-1 px-2"><p className="font-medium">{stats?.downloads ?? 0}</p><p className="text-xs text-slate-500">Downloads</p></div>
        <div className="flex-1 px-2"><p className="font-medium">{version ? fmtSize(version.apk_size_bytes) : "—"}</p><p className="text-xs text-slate-500">Size</p></div>
        <div className="flex-1 px-2"><p className="font-medium">{version ? `API ${version.min_android_sdk}+` : "—"}</p><p className="text-xs text-slate-500">Android</p></div>
      </div>

      <div className="flex gap-3">
        <button onClick={download} disabled={busy || !version}
          className="flex-1 rounded-full bg-blue-700 py-3 font-medium text-white disabled:opacity-50">
          {busy ? "Please wait…" : version ? "Download" : "Not available yet"}
        </button>
        <button onClick={share} className="rounded-full border border-slate-300 px-6 py-3 font-medium text-blue-700">Share</button>
      </div>
      {note && <p role="status" className={`mt-3 rounded-xl p-3 text-sm ${note.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{note.text}</p>}

      {shots.length > 0 && (
        <div className="-mx-4 mt-6 flex gap-3 overflow-x-auto px-4">
          {shots.map((u) => <img key={u} src={u} alt="Screenshot" className="h-64 w-auto shrink-0 rounded-2xl border border-slate-200 object-cover" />)}
        </div>
      )}

      <section className="mt-7">
        <h2 className="mb-2 text-xl font-medium">About this app</h2>
        <p className="whitespace-pre-line text-slate-700">{app.full_description || app.short_description}</p>
      </section>

      {version && (
        <section className="mt-7">
          <h2 className="mb-2 text-xl font-medium">What&apos;s new</h2>
          <p className="text-sm text-slate-500">Version {version.version_name} · updated {new Date(version.created_at).toLocaleDateString()}</p>
          {version.release_notes && <p className="mt-1 whitespace-pre-line text-slate-700">{version.release_notes}</p>}
        </section>
      )}

      <section className="mt-7">
        <h2 className="mb-3 text-xl font-medium">Ratings and reviews</h2>
        {session ? (
          <div className="mb-5 rounded-2xl bg-slate-50 p-4">
            <p className="mb-2 text-sm font-medium">{mine ? "Your review" : "Rate this app"}</p>
            <div className="mb-2 flex gap-1 text-3xl text-amber-500">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setMyRating(n)} aria-label={`${n} stars`}>{n <= myRating ? "★" : "☆"}</button>
              ))}
            </div>
            <textarea value={myText} onChange={(e) => setMyText(e.target.value)} maxLength={2000} rows={3} placeholder="Write a review (optional)"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500" />
            <button onClick={submitReview} disabled={busy || myRating < 1}
              className="mt-2 rounded-full bg-blue-700 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{mine ? "Update" : "Submit"}</button>
          </div>
        ) : (
          <p className="mb-5 text-sm text-slate-500"><Link to="/login" className="text-blue-700 underline">Sign in</Link> to rate and review.</p>
        )}
        {reviews.length === 0 && <p className="text-slate-500">No reviews yet.</p>}
        {reviews.map((r) => (
          <div key={r.id} className="border-b border-slate-100 py-3">
            <p className="text-amber-500">{stars(r.rating)} <span className="ml-2 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span></p>
            {r.body && <p className="mt-1 text-sm text-slate-700">{r.body}</p>}
          </div>
        ))}
      </section>
    </>,
  );
}
