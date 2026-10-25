import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Category = { id: string; slug: string; name: string };
type AppRow = {
  id: string; slug: string; name: string; short_description: string;
  icon_path: string | null; category_id: string | null;
  developer_profiles: { display_name: string } | null;
};

const iconUrl = (p: string | null) =>
  p ? supabase.storage.from("app-icons").getPublicUrl(p).data.publicUrl : null;

export default function Home() {
  const { session, access } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_categories").select("id,slug,name").order("sort_order")
      .then(({ data }) => setCats((data as Category[]) ?? []));
  }, []);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    let query = supabase
      .from("apps")
      .select("id,slug,name,short_description,icon_path,category_id,developer_profiles(display_name)")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(60);
    const term = q.trim().replace(/[%,()]/g, " ");
    if (term) query = query.ilike("name", `%${term}%`);
    if (cat) query = query.eq("category_id", cat);
    query.then(({ data, error: e }) => {
      if (stale) return;
      if (e) setError("অ্যাপের তালিকা আনা যায়নি। একটু পরে আবার চেষ্টা করুন।");
      else { setError(null); setApps((data as unknown as AppRow[]) ?? []); }
      setLoading(false);
    });
    return () => { stale = true; };
  }, [q, cat]);

  const dest = access?.role === "admin" ? "/admin" : "/developer";

  return (
    <div className="min-h-screen bg-[#050a1f] text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#050a1f]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/brand/logo-full.png" alt="FAST STORE" className="h-10 w-10 rounded-lg object-cover" />
          <span className="hidden font-semibold sm:block">FAST STORE</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="অ্যাপ খুঁজুন…"
            aria-label="Search apps"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm outline-none focus:border-cyan-400"
          />
          {session
            ? <Link to={dest} className="rounded-full bg-white/10 px-4 py-2 text-sm">{access?.role === "admin" ? "Admin" : "Developer"}</Link>
            : <Link to="/login" className="rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 text-sm font-medium">Sign in</Link>}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {cats.length > 0 && (
          <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCat(null)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${cat === null ? "border-cyan-400 bg-cyan-400/10" : "border-white/10"}`}>
              সব
            </button>
            {cats.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${cat === c.id ? "border-cyan-400 bg-cyan-400/10" : "border-white/10"}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {loading && <p className="text-slate-400">লোড হচ্ছে…</p>}

        {!loading && !error && apps.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center">
            <p className="text-lg font-medium">{q || cat ? "কোনো অ্যাপ পাওয়া যায়নি" : "এখনো কোনো অ্যাপ প্রকাশিত হয়নি"}</p>
            <p className="mt-1 text-sm text-slate-400">
              {q || cat ? "অন্য নামে বা অন্য ক্যাটাগরিতে খুঁজে দেখুন।" : "ডেভেলপাররা অ্যাপ প্রকাশ করলে এখানে দেখা যাবে।"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => {
            const icon = iconUrl(a.icon_path);
            return (
              <Link key={a.id} to={`/app/${a.slug}`}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-cyan-400/50">
                {icon
                  ? <img src={icon} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  : <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 font-bold">{a.name[0]}</div>}
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-slate-400">{a.developer_profiles?.display_name ?? ""}</p>
                  <p className="truncate text-xs text-slate-500">{a.short_description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
