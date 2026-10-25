import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Mode = "home" | "apps" | "games" | "search";
type Category = { id: string; slug: string; name: string };
type AppRow = {
  id: string; slug: string; name: string; short_description: string;
  icon_path: string | null; category_id: string | null;
  developer_profiles: { display_name: string } | null;
};

const COLUMNS = "id,slug,name,short_description,icon_path,category_id,developer_profiles(display_name)";
const TITLES: Record<Mode, string> = { home: "New apps", apps: "Apps", games: "Games", search: "Search results" };
const iconUrl = (p: string | null) =>
  p ? supabase.storage.from("app-icons").getPublicUrl(p).data.publicUrl : null;

function Icon({ a, size }: { a: AppRow; size: string }) {
  const url = iconUrl(a.icon_path);
  return url
    ? <img src={url} alt="" className={`${size} shrink-0 rounded-2xl object-cover`} />
    : <div className={`${size} grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-lg font-bold`}>{a.name[0]}</div>;
}

export default function Home({ mode = "home" }: { mode?: Mode }) {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoaded, setCatsLoaded] = useState(false);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [featured, setFeatured] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_categories").select("id,slug,name").order("sort_order")
      .then(({ data }) => { setCats((data as Category[]) ?? []); setCatsLoaded(true); });
    supabase.from("apps").select(COLUMNS).eq("status", "published").eq("featured", true).limit(10)
      .then(({ data }) => setFeatured((data as unknown as AppRow[]) ?? []));
  }, []);

  const gamesId = cats.find((c) => c.slug === "games")?.id;

  useEffect(() => {
    if ((mode === "games" || mode === "apps") && !catsLoaded) return;
    if (mode === "games" && !gamesId) { setApps([]); setLoading(false); return; }
    let stale = false;
    setLoading(true);
    let query = supabase.from("apps").select(COLUMNS).eq("status", "published")
      .order("published_at", { ascending: false }).limit(60);
    const term = q.trim().replace(/[%,()]/g, " ");
    if (term) query = query.ilike("name", `%${term}%`);
    if (mode === "games") query = query.eq("category_id", gamesId!);
    else if (mode === "apps" && gamesId) query = query.or(`category_id.is.null,category_id.neq.${gamesId}`);
    if (cat) query = query.eq("category_id", cat);
    query.then(({ data, error: e }) => {
      if (stale) return;
      if (e) setError("Could not load apps. Please try again shortly.");
      else { setError(null); setApps((data as unknown as AppRow[]) ?? []); }
      setLoading(false);
    });
    return () => { stale = true; };
  }, [q, cat, mode, catsLoaded, gamesId]);

  const u = session?.user;
  const initial = (u?.user_metadata?.full_name ?? u?.email ?? "?")[0].toUpperCase();
  const avatar = u?.user_metadata?.avatar_url as string | undefined;
  const filtering = Boolean(q.trim() || cat);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <img src="/brand/icon.png" alt="FAST STORE" className="h-10 w-10 object-contain" />
          {mode === "search" ? (
            <input
              value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Search apps & games" aria-label="Search"
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-sm outline-none focus:border-blue-500"
            />
          ) : (
            <div className="flex-1" />
          )}
          {session ? (
            <Link to="/profile" aria-label="Profile" className="shrink-0">
              {avatar
                ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full object-cover" />
                : <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-600 text-sm text-white">{initial}</span>}
            </Link>
          ) : (
            <Link to="/login" className="shrink-0 rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-sm font-medium text-white">Sign in</Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {mode !== "games" && cats.length > 0 && (
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {[{ id: null, name: "All" }, ...cats].map((c) => (
              <button key={c.id ?? "all"} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${cat === c.id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50"}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {mode === "home" && !filtering && (
          <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-violet-600 to-fuchsia-500 p-6 text-white shadow-lg">
            <p className="text-2xl font-bold">Discover apps &amp; games</p>
            <p className="mt-1 text-sm text-white/80">Fast, free downloads from approved developers.</p>
          </section>
        )}

        {mode === "home" && !filtering && featured.length > 0 && (
          <section className="mb-7">
            <h2 className="mb-3 text-lg font-semibold">Featured</h2>
            <div className="flex snap-x gap-3 overflow-x-auto pb-2">
              {featured.map((a) => (
                <div key={a.id} className="w-[85%] shrink-0 snap-start sm:w-[22rem]">
                  <div className="grid h-40 place-items-center rounded-3xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-500 p-4 text-center">
                    <p className="text-xl font-semibold text-white">{a.name}</p>
                  </div>
                  <div className="flex items-center gap-3 px-1 pt-3">
                    <Icon a={a} size="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-slate-500">{a.developer_profiles?.display_name ?? ""}</p>
                    </div>
                    <Link to={`/app/${a.slug}`} className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">View</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <h2 className="mb-3 text-lg font-semibold">{filtering && mode === "home" ? "Search results" : TITLES[mode]}</h2>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && <p className="text-slate-500">Loading…</p>}

        {!loading && !error && apps.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-lg font-medium">{filtering ? "No apps found" : "No apps published yet"}</p>
            <p className="mt-1 text-sm text-slate-500">
              {filtering ? "Try a different name or category." : "Apps will appear here once developers publish them."}
            </p>
          </div>
        )}

        <div className="divide-y divide-slate-200">
          {apps.map((a) => (
            <Link key={a.id} to={`/app/${a.slug}`} className="flex items-center gap-3 py-3">
              <Icon a={a} size="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name}</p>
                <p className="truncate text-xs text-slate-500">{a.developer_profiles?.display_name ?? ""}</p>
                <p className="truncate text-xs text-slate-400">{a.short_description}</p>
              </div>
              <span className="rounded-full border border-blue-500 px-4 py-1.5 text-sm text-blue-400">View</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
