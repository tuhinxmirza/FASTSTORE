import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { TopBar } from "./Home";

type Note = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };

export default function Notifications() {
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("notifications")
      .select("id,title,body,read_at,created_at").order("created_at", { ascending: false }).limit(50);
    if (e) setError(true); else { setError(false); setNotes((data as Note[]) ?? []); }
  }, []);
  useEffect(() => { if (session) load(); }, [session, load]);

  async function markAllRead() {
    const { error: e } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    if (e) setError(true); else load();
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-medium">Notifications</h1>
          {notes?.some((n) => !n.read_at) && (
            <button onClick={markAllRead} className="text-sm font-medium text-blue-700">Mark all as read</button>
          )}
        </div>
        {!session && <p className="rounded-3xl bg-slate-50 p-8 text-center">Please <Link to="/login" className="text-blue-700 underline">sign in</Link> to see notifications.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-600">Could not load notifications.</p>}
        {session && !notes && !error && <p className="text-slate-500">Loading…</p>}
        {notes && notes.length === 0 && <p className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">You have no notifications.</p>}
        {notes?.map((n) => (
          <div key={n.id} className="flex gap-3 border-b border-slate-100 py-3">
            <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-blue-600"}`} />
            <div className="min-w-0">
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
              <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
