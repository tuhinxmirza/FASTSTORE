import { BrowserRouter, Routes, Route, Outlet, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireRole, RequireSignedIn } from "./auth/guards";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Categories from "./pages/Categories";
import AppDetail from "./pages/AppDetail";
import Developer from "./pages/Developer";
import DeveloperVerification from "./pages/DeveloperVerification";
import DeveloperApps from "./pages/DeveloperApps";
import DeveloperAppEdit from "./pages/DeveloperAppEdit";
import AdminRequirements from "./pages/AdminRequirements";
import AdminVerifications from "./pages/AdminVerifications";
import AdminDevelopers from "./pages/AdminDevelopers";
import AdminSettings from "./pages/AdminSettings";
import AdminCategories from "./pages/AdminCategories";
import AdminApps from "./pages/AdminApps";
import AdminUsers from "./pages/AdminUsers";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import Notifications from "./pages/Notifications";
import AdminDashboard from "./pages/AdminDashboard";

const Stub = ({ title }: { title: string }) => {
  const { signOut, access } = useAuth();
  return (
    <div className="min-h-screen bg-white p-10 text-slate-900">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">Role: {access?.role ?? "guest"} (page built in a later phase)</p>
      {access && <button onClick={signOut} className="mt-4 rounded-lg border border-slate-300 px-3 py-1.5 text-sm">Sign out</button>}
    </div>
  );
};

const NAV = [
  { to: "/games", label: "Games", d: "M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 1.99-.9 1.99-2L23 8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" },
  { to: "/", label: "Apps", d: "M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" },
  { to: "/search", label: "Search", d: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" },
  { to: "/profile", label: "You", d: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
];

function PublicLayout() {
  return (
    <>
      <div className="pb-20"><Outlet /></div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl justify-around">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"}
              className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2 text-xs ${isActive ? "text-blue-700" : "text-slate-500"}`}>
              {({ isActive }) => (
                <>
                  <span className={`grid h-7 w-14 place-items-center rounded-full ${isActive ? "bg-blue-100" : ""}`}>
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current"><path d={n.d} /></svg>
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/category/:slug" element={<Home mode="category" />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/apps" element={<Home mode="apps" />} />
            <Route path="/games" element={<Home mode="games" />} />
            <Route path="/search" element={<Home mode="search" />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/privacy" element={<Stub title="Privacy Policy" />} />
            <Route path="/terms" element={<Stub title="Terms of Service" />} />
            <Route path="/app/:slug" element={<AppDetail />} />
          </Route>
          <Route element={<RequireSignedIn />}>
            <Route path="/developer" element={<Developer />} />
            <Route path="/developer/verification" element={<DeveloperVerification />} />
            <Route path="/developer/apps" element={<DeveloperApps />} />
            <Route path="/developer/apps/:id" element={<DeveloperAppEdit />} />
            <Route path="/developer/*" element={<Stub title="Developer Console" />} />
          </Route>
          <Route element={<RequireRole roles={["admin"]} />}>
            <Route path="/admin/requirements" element={<AdminRequirements />} />
            <Route path="/admin/verifications" element={<AdminVerifications />} />
            <Route path="/admin/developers" element={<AdminDevelopers />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/categories" element={<AdminCategories />} />
            <Route path="/admin/apps" element={<AdminApps />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
            <Route path="/admin/*" element={<AdminDashboard />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
