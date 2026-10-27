-- Let developers resubmit rejected apps (status stays within developer-controlled values).
drop policy if exists apps_owner_update on apps;
create policy apps_owner_update on apps for update
  using (developer_id = auth.uid() and can_publish())
  with check (developer_id = auth.uid() and can_publish()
              and status in ('draft','submitted','pending_review','unpublished','rejected'));
