import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { RequireRole, RequireSignedIn } from "./auth/guards";
import Login from "./pages/Login";

const Stub = ({ title }: { title: string }) => {
  const { signOut, access } = useAuth();
  return (
    <div className="min-h-screen bg-[#050a1f] p-10 text-slate-100">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">Role: {access?.role ?? "guest"} (page built in a later phase)</p>
      {access && <button onClick={signOut} className="mt-4 rounded-lg border border-white/20 px-3 py-1.5 text-sm">Sign out</button>}
    </div>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Stub title="FAST STORE: Home" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Stub title="Privacy Policy" />} />
          <Route path="/terms" element={<Stub title="Terms of Service" />} />
          <Route element={<RequireSignedIn />}>
            <Route path="/developer/*" element={<Stub title="Developer Console" />} />
          </Route>
          <Route element={<RequireRole roles={["admin"]} />}>
            <Route path="/admin/*" element={<Stub title="Admin Panel" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
