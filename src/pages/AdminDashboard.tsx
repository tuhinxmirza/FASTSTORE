import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";

type Category = { id: string; slug: string; name: string; sort_order: number };

const DEFAULTS = [
  "Games", "Education", "Productivity", "Social", "Communication", "Entertainment", "Business", "Finance",
  "Photography", "Video and Music", "Utilities", "Lifestyle", "Health and Fitness", "News", "Travel", "Tools",
];
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function count(table: string, filter?: (q: any) => any) {
  let q: any = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  if (error) throw error;
  return n ?? 0;
}

export default function AdminDashboard() {
  const { signOut } = useAuth();
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [users, devs, pending, apps, published] = await Promise.all([
        count("profiles"),
        count("developer_profiles"),
        count("developer_verification_applications", (q) => q.in("status", ["submitted", "under_review"])),
        count("apps"),
        count("apps", (q) => q.eq("status", "published")),
      ]);
      setStats({ users, devs, pending, apps, published });
      const { data, error: e } = await supabase.from("app_categories").select("*").order("sort_order");
      if (e) throw e;
      setCats((data as Category[]) ?? []);
      setError(null);
    } catch {
      setError("Could not load data. Please refresh the page.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addCategories(names: string[]) {
    setMsg(null);
    const base = cats.length;
    const rows = names.map((n, i) => ({ name: n, slug: slugify(n), sort_order: base + i }))
      .filter((r) => r.slug);
    const { error: e } = await supabase.from("app_categories")
      .upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
    if (e) setError("Could not add category.");
    else { setMsg("Category added."); setName(""); await load(); }
  }

  const cards: [string, string][] = stats ? [
    ["Total users", String(stats.users)],
    ["Developers", String(stats.devs)],
    ["Pending verifications", String(stats.pending)],
    ["Total apps", String(stats.apps)],
    ["Published apps", String(stats.published)],
  ] : [];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <img src="/brand/icon.png" alt="" className="h-9 w-9 object-contain" />
        <h1 className="flex-1 font-semibold">Admin Panel</h1>
        <Link to="/" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Store</Link>
        <button onClick={signOut} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Sign out</button>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

        <section>
          <h2 className="mb-3 text-lg font-medium">Overview</h2>
          {!stats && !error && <p className="text-slate-500">Loading…</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-3xl font-semibold">{value}</p>
                <p className="mt-1 text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Categories ({cats.length})</h2>
          {msg && <p className="mb-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</p>}
          {cats.length === 0 && (
            <button onClick={() => addCategories(DEFAULTS)}
              className="mb-4 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 font-medium text-white">
              Add 16 standard categories
            </button>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {cats.map((c) => <span key={c.id} className="rounded-full border border-slate-200 px-3 py-1 text-sm">{c.name}</span>)}
          </div>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <button disabled={!slugify(name)} onClick={() => addCategories([name.trim()])}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm disabled:opacity-40">Add</button>
          </div>
        </section>
      </main>
    </div>
  );
}
