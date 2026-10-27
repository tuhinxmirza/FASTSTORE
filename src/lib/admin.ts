import { supabase } from "./supabase";

export const fieldCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500";
export const btn = "rounded-full border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50";
export const btnPrimary = "rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
export const btnDanger = "rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export async function audit(
  adminId: string, action: string, targetType: string,
  targetId: string | null = null, reason: string | null = null, details: object | null = null,
) {
  const { error } = await supabase.from("admin_audit_logs").insert({
    admin_id: adminId, action, target_type: targetType, target_id: targetId, reason, details,
  });
  if (error) console.error("audit failed", error.message);
}

export async function notify(userId: string, type: string, title: string, body?: string | null) {
  const { error } = await supabase.from("notifications").insert({ user_id: userId, type, title, body: body || null });
  if (error) console.error("notify failed", error.message);
}
