import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { TopBar } from "./Home";

type Category = { id: string; slug: string; name: string };

export default function Categories() {
  const [cats, setCats] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    supabase.from("app_categories").select("id,slug,name").order("sort_order")
      .then(({ data, error: e }) => { if (e) setError(true); else setCats((data as Category[]) ?? []); });
  }, []);
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-6">
        <h1 className="mb-4 text-2xl font-medium">Categories</h1>
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Could not load categories.</p>}
        {!cats && !error && <p className="text-slate-500">Loading…</p>}
        {cats && cats.length === 0 && <p className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">No categories yet.</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cats?.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`}
              className="rounded-2xl bg-slate-100 px-4 py-5 font-medium text-slate-800 active:bg-slate-200">{c.name}</Link>
          ))}
        </div>
      </main>
    </div>
  );
}
