// Verifies the caller's Google identity, then grants/revokes the admin role
// by comparing the VERIFIED email with the server-only allowlist.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "unauthenticated" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.auth.getUser(token); // validates the JWT server-side
  const user = data?.user;
  if (error || !user) return json({ error: "unauthenticated" }, 401);
  if (!user.email || !user.email_confirmed_at) return json({ error: "email_not_verified" }, 403);

  const allow = (Deno.env.get("FAST_STORE_ADMIN_EMAILS") ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAllowed = allow.includes(user.email.toLowerCase());

  // make sure profile exists (trigger normally does this)
  await admin.from("profiles").upsert(
    { id: user.id, email: user.email, full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (isAllowed) {
    await admin.from("user_roles").upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
  } else {
    // allowlist removal revokes admin access
    await admin.from("user_roles").delete().eq("user_id", user.id).eq("role", "admin");
  }

  const { data: dev } = await admin.from("developer_profiles").select("status").eq("id", user.id).maybeSingle();
  const { data: p } = await admin.from("profiles").select("suspended").eq("id", user.id).single();
  if (p?.suspended) return json({ error: "account_suspended" }, 403);

  const role = isAllowed ? "admin" : dev ? "developer" : "user";
  const destination = isAllowed ? "/admin" : dev ? "/developer" : "/";
  return json({ role, developerStatus: dev?.status ?? null, destination });
});
