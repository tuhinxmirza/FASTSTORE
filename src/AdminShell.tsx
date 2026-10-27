import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import Shell from "./Shell";

const TABS = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/verifications", label: "Verifications" },
  { to: "/admin/requirements", label: "Requirements" },
  { to: "/admin/settings", label: "Settings" },
];

export default function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Shell title={title} back={{ to: "/", label: "Store" }}>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end
            className={({ isActive }) => `shrink-0 rounded-full px-4 py-2 text-sm font-medium ${isActive ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      {children}
    </Shell>
  );
}
