import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Profile() {
  const { session, access, signOut } = useAuth();

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-white p-6 text-center text-slate-900">
        <div>
          <img src="/brand/icon.png" alt="" className="mx-auto h-28 w-28 object-contain" />
          <p className="mt-4 text-lg font-medium">Sign in to your account</p>
          <Link to="/login" className="mt-4 inline-block rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-2.5 font-medium text-white">
            Sign in with Google
          </Link>
        </div>
      </div>
    );
  }

  const u = session.user;
  const name = (u.user_metadata?.full_name as string | undefined) ?? u.email ?? "";
  const avatar = u.user_metadata?.avatar_url as string | undefined;

  const items: { to: string; label: string }[] = [];
  if (access?.role === "admin") items.push({ to: "/admin", label: "Admin Panel" });
  items.push({ to: "/developer", label: "Developer Console" });
  items.push({ to: "/privacy", label: "Privacy Policy" });
  items.push({ to: "/terms", label: "Terms of Service" });

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          {avatar
            ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
            : <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-600 text-2xl text-white">{name[0]?.toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            <p className="truncate text-sm text-slate-500">{u.email}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="flex items-center justify-between border-b border-slate-200 px-5 py-4 last:border-0">
              <span>{i.label}</span><span className="text-slate-400">›</span>
            </Link>
          ))}
        </div>

        <button onClick={signOut} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-left text-red-600">
          Sign out
        </button>
      </main>
    </div>
  );
}
