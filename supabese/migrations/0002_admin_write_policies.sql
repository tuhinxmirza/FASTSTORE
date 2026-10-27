-- Admin client writes needed by the admin pages (audit log, notifications, publish permission).
create policy audit_insert on admin_audit_logs for insert with check (is_admin() and admin_id = auth.uid());
create policy notif_admin_insert on notifications for insert with check (is_admin());
create policy perms_admin_write on developer_permissions for all using (is_admin()) with check (is_admin());
create policy dev_admin_update on developer_profiles for update using (is_admin()) with check (is_admin());
