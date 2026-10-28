-- Developers can mark their own older versions as not current when uploading a new one.
create policy av_owner_update on app_versions for update
  using (can_publish() and exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()))
  with check (can_publish() and exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()));
