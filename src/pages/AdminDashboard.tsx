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
      setError("তথ্য আনা যায়নি। পাতাটি রিফ্রেশ করুন।");
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
    if (e) setError("ক্যাটাগরি যোগ করা যায়নি।");
    else { setMsg("ক্যাটাগরি যোগ হয়েছে।"); setName(""); await load(); }
  }

  const cards: [string, string][] = stats ? [
    ["মোট ব্যবহারকারী", String(stats.users)],
    ["ডেভেলপার", String(stats.devs)],
    ["অপেক্ষমাণ যাচাই", String(stats.pending)],
    ["মোট অ্যাপ", String(stats.apps)],
    ["প্রকাশিত অ্যাপ", String(stats.published)],
  ] : [];

  return (
    <div className="min-h-screen bg-[#050a1f] text-slate-100">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <img src="/brand/logo-full.png" alt="" className="h-9 w-9 rounded-lg object-cover" />
        <h1 className="flex-1 font-semibold">Admin Panel</h1>
        <Link to="/" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm">Store</Link>
        <button onClick={signOut} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm">Sign out</button>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 p-4">
        {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

        <section>
          <h2 className="mb-3 text-lg font-medium">সারসংক্ষেপ</h2>
          {!stats && !error && <p className="text-slate-400">লোড হচ্ছে…</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-3xl font-semibold">{value}</p>
                <p className="mt-1 text-sm text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">ক্যাটাগরি ({cats.length})</h2>
          {msg && <p className="mb-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{msg}</p>}
          {cats.length === 0 && (
            <button onClick={() => addCategories(DEFAULTS)}
              className="mb-4 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2 font-medium">
              ১৬টি স্ট্যান্ডার্ড ক্যাটাগরি যোগ করুন
            </button>
          )}
          <div className="mb-4 flex flex-wrap gap-2">
            {cats.map((c) => <span key={c.id} className="rounded-full border border-white/10 px-3 py-1 text-sm">{c.name}</span>)}
          </div>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="নতুন ক্যাটাগরির নাম"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-cyan-400" />
            <button disabled={!slugify(name)} onClick={() => addCategories([name.trim()])}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm disabled:opacity-40">যোগ করুন</button>
          </div>
        </section>
      </main>
    </div>
  );
}
