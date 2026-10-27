// Edge Function: gives a short-lived APK download link for a PUBLISHED app and records the download.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let slug = "";
  try { slug = String((await req.json()).slug ?? ""); } catch { /* no body */ }
  if (!slug) return json({ error: "Missing app." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // signed-in users are recorded; guests can still download
  let userId: string | null = null;
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }

  const { data: app } = await admin.from("apps").select("id,status").eq("slug", slug).maybeSingle();
  if (!app || app.status !== "published") return json({ error: "This app is not available." }, 404);

  const { data: ver } = await admin.from("app_versions")
    .select("id,apk_path,version_name").eq("app_id", app.id)
    .order("is_current", { ascending: false }).order("version_code", { ascending: false })
    .limit(1).maybeSingle();
  if (!ver) return json({ error: "No downloadable version yet." }, 404);

  // make sure the file really exists before promising a download
  const cut = ver.apk_path.lastIndexOf("/");
  const folder = cut >= 0 ? ver.apk_path.slice(0, cut) : "";
  const file = ver.apk_path.slice(cut + 1);
  const { data: files } = await admin.storage.from("published-apks").list(folder, { limit: 5, search: file });
  if (!files?.some((f) => f.name === file)) return json({ error: "The APK file could not be found." }, 404);

  const { data: signed, error } = await admin.storage.from("published-apks")
    .createSignedUrl(ver.apk_path, 120, { download: true });
  if (error || !signed?.signedUrl) return json({ error: "Could not prepare the download." }, 500);

  await admin.from("app_download_events").insert({ app_id: app.id, version_id: ver.id, user_id: userId });
  return json({ url: signed.signedUrl, version: ver.version_name });
});
