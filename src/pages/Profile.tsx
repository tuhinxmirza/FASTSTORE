import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";

export default function Profile() {
  const { session, access, signOut } = useAuth();

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#050a1f] p-6 text-center text-slate-100">
        <div>
          <img src="/brand/logo-full.png" alt="" className="mx-auto h-32 w-32 rounded-2xl object-cover" />
          <p className="mt-4 text-lg font-medium">আপনার অ্যাকাউন্টে সাইন-ইন করুন</p>
          <Link to="/login" className="mt-4 inline-block rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-2.5 font-medium">
            Google দিয়ে সাইন-ইন
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
    <div className="min-h-screen bg-[#050a1f] text-slate-100">
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          {avatar
            ? <img src={avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
            : <span className="grid h-16 w-16 place-items-center rounded-full bg-slate-600 text-2xl">{name[0]?.toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{name}</p>
            <p className="truncate text-sm text-slate-400">{u.email}</p>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
          {items.map((i) => (
            <Link key={i.to} to={i.to} className="flex items-center justify-between border-b border-white/10 px-5 py-4 last:border-0">
              <span>{i.label}</span><span className="text-slate-500">›</span>
            </Link>
          ))}
        </div>

        <button onClick={signOut} className="w-full rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left text-red-300">
          Sign out
        </button>
      </main>
    </div>
  );
}
