import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth, type Role } from "./AuthProvider";

// UX-only guards. Real enforcement is RLS + Edge Functions on the backend.
export function RequireRole({ roles }: { roles: Role[] }) {
  const { session, access, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 text-slate-400">Loading…</div>;
  if (!session || !access) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!roles.includes(access.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}

// any signed-in user may open /developer (to apply for access)
export function RequireSignedIn() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-slate-400">Loading…</div>;
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
