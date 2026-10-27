import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { audit, btn, btnPrimary, fieldCls } from "../lib/admin";
import Shell from "./AdminShell";

type Cat = { id: string; slug: string; name: string; sort_order: number };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function AdminCategories() {
  const { session } = useAuth();
  const me = session!.user.id;
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("app_categories").select("*").order("sort_order");
    if (e) setError("Could not load categories."); else { setError(null); setCats((data as Cat[]) ?? []); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const n = name.trim(); if (!n) return;
    const { error: e } = await supabase.from("app_categories").insert({ name: n, slug: slugify(n), sort_order: cats?.length ?? 0 });
    if (e) { setError("Could not add the category."); return; }
    await audit(me, "category.create", "app_category", null, n);
    setName(""); load();
  }
  async function remove(c: Cat) {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    const { error: e } = await supabase.from("app_categories").delete().eq("id", c.id);
    if (e) { setError("Could not delete the category."); return; }
    await audit(me, "category.delete", "app_category", c.id, c.name);
    load();
  }

  return (
    <Shell title="Categories">
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <input className={fieldCls} placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={btnPrimary} onClick={add}>Add</button>
      </div>
      {!cats && !error && <p className="text-slate-500">Loading…</p>}
      {cats?.map((c) => (
        <div key={c.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-3">
          <span>{c.name}</span>
          <button className={btn} onClick={() => remove(c)}>Delete</button>
        </div>
      ))}
    </Shell>
  );
}
