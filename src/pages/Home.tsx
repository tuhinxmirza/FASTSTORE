import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Mode = "apps" | "games" | "search" | "category";
type Category = { id: string; slug: string; name: string };
type AppRow = {
  id: string; slug: string; name: string; short_description: string;
  icon_path: string | null; category_id: string | null;
  developer_profiles: { display_name: string } | null;
};

const COLS = "id,slug,name,short_description,icon_path,category_id,developer_profiles(display_name)";
const iconUrl = (p: string | null) =>
  p ? supabase.storage.from("app-icons").getPublicUrl(p).data.publicUrl : null;

export function AppIcon({ a, size }: { a: AppRow; size: string }) {
  const url = iconUrl(a.icon_path);
  return url
    ? <img src={url} alt="" className={`${size} shrink-0 rounded-[22%] object-cover`} />
    : <div className={`${size} grid shrink-0 place-items-center rounded-[22%] bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-bold text-white`}>{a.name[0]}</div>;
}

// Top bar shared by all store pages: logo on the left, bell + profile on the right
export function TopBar({ children }: { children?: ReactNode }) {
  const { session } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!session) { setUnread(0); return; }
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [session]);
  const u = session?.user;
  const initial = (u?.user_metadata?.full_name ?? u?.email ?? "?")[0].toUpperCase();
  const avatar = u?.user_metadata?.avatar_url as string | undefined;
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link to="/" aria-label="FAST STORE"><img src="/brand/icon.png" alt="FAST STORE" className="h-10 w-10 object-contain" /></Link>
        {children ?? <div className="flex-1" />}
        {session && (
          <Link to="/notifications" aria-label="Notifications" className="relative shrink-0 p-1.5 text-slate-700">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-medium text-white">{unread}</span>}
          </Link>
        )}
        {session ? (
          <Link to="/profile" aria-label="Profile" className="shrink-0">
            {avatar
              ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover" />
              : <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-600 text-sm text-white">{initial}</span>}
          </Link>
        ) : (
          <Link to="/login" className="shrink-0 rounded-full bg-blue-700 px-5 py-2 text-sm font-medium text-white">Sign in</Link>
        )}
      </div>
    </header>
  );
}

export default function Home({ mode = "apps" }: { mode?: Mode }) {
  const { slug } = useParams();
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [featured, setFeatured] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_categories").select("id,slug,name").order("sort_order")
      .then(({ data }) => { setCats((data as Category[]) ?? []); setCatsLoaded(true); });
    supabase.from("apps").select(COLS).eq("status", "published").eq("featured", true).limit(10)
      .then(({ data }) => setFeatured((data as unknown as AppRow[]) ?? []));
  }, []);

  const gamesId = cats.find((c) => c.slug === "games")?.id;
  const thisCat = mode === "category" ? cats.find((c) => c.slug === slug) : undefined;

  useEffect(() => {
    if (mode !== "search" && !catsLoaded) return;
    if ((mode === "games" && !gamesId) || (mode === "category" && !thisCat)) { setApps([]); setLoading(false); return; }
    let stale = false;
    setLoading(true);
    let query = supabase.from("apps").select(COLS).eq("status", "published")
      .order("published_at", { ascending: false }).limit(60);
    const term = q.trim().replace(/[%,()]/g, " ");
    if (term) query = query.ilike("name", `%${term}%`);
    if (mode === "games") query = query.eq("category_id", gamesId!);
    else if (mode === "category") query = query.eq("category_id", thisCat!.id);
    else if (mode === "apps" && gamesId) query = query.or(`category_id.is.null,category_id.neq.${gamesId}`);
    query.then(({ data, error: e }) => {
      if (stale) return;
      if (e) setError("Could not load apps. Please try again shortly.");
      else { setError(null); setApps((data as unknown as AppRow[]) ?? []); }
      setLoading(false);
    });
    return () => { stale = true; };
  }, [q, mode, catsLoaded, gamesId, thisCat?.id]);

  const searching = mode === "search";
  const showFeatured = mode === "apps" && featured.length > 0;
  const rail = searching ? [] : apps.slice(0, 10);
  const rest = searching ? apps : apps.slice(10);
  const title = mode === "games" ? "Games" : mode === "category" ? (thisCat?.name ?? "Category")
    : searching ? (q.trim() ? "Search results" : "Search apps & games") : "New releases";

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopBar>
        {searching
          ? <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Search apps & games" aria-label="Search"
              className="min-w-0 flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-sm outline-none ring-blue-600 focus:ring-2" />
          : undefined}
      </TopBar>

      <main className="mx-auto max-w-3xl px-4 pb-6">
        {!searching && (
          <div className="mb-5 flex gap-2 overflow-x-auto">
            <Link to="/categories" className="shrink-0 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Categories</Link>
          </div>
        )}

        {showFeatured && (
          <div className="mb-7 flex snap-x gap-3 overflow-x-auto pb-1">
            {featured.map((a) => (
              <Link key={a.id} to={`/app/${a.slug}`} className="w-[88%] shrink-0 snap-start sm:w-[24rem]">
                <div className="relative grid h-44 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-100 via-violet-200 to-sky-200">
                  <AppIcon a={a} size="h-24 w-24" />
                  <p className="absolute bottom-3 left-4 right-4 truncate text-sm font-medium text-indigo-900">{a.short_description}</p>
                </div>
                <div className="flex items-center gap-3 px-1 pt-3">
                  <AppIcon a={a} size="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="truncate text-xs text-slate-500">{a.developer_profiles?.display_name ?? ""}</p>
                  </div>
                  <span className="rounded-full bg-blue-700 px-5 py-2 text-sm font-medium text-white">View</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-slate-500">Loading…</p>}

        {!loading && !error && apps.length === 0 && (
          <div className="rounded-3xl bg-slate-50 p-10 text-center">
            <p className="text-lg font-medium">{q.trim() || mode === "category" ? "No apps found" : "No apps published yet"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {q.trim() ? "Try a different name." : "Apps will appear here once developers publish them."}
            </p>
          </div>
        )}

        {rail.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-3 text-xl font-medium">{title}</h2>
            <div className="flex gap-4 overflow-x-auto pb-1">
              {rail.map((a) => (
                <Link key={a.id} to={`/app/${a.slug}`} className="w-24 shrink-0">
                  <AppIcon a={a} size="h-24 w-24" />
                  <p className="mt-2 truncate text-sm">{a.name}</p>
                  <p className="truncate text-xs text-slate-500">{a.developer_profiles?.display_name ?? ""}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {rest.length > 0 && (
          <section>
            {(searching || rail.length > 0) && <h2 className="mb-1 text-xl font-medium">{searching ? title : "More apps"}</h2>}
            {rest.map((a) => (
              <Link key={a.id} to={`/app/${a.slug}`} className="flex items-center gap-4 py-3">
                <AppIcon a={a} size="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{a.name}</p>
                  <p className="truncate text-xs text-slate-500">{a.developer_profiles?.display_name ?? ""}</p>
                </div>
                <span className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-medium text-blue-700">View</span>
              </Link>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
