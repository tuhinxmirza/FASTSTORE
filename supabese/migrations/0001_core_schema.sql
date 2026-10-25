set check_function_bodies = off;

-- FAST STORE — Phase 1 core schema, RLS and storage buckets
-- Run in the Supabase SQL editor or via `supabase db push`.
-- Admin role is NEVER set from the client: the `sync-admin` Edge Function
-- (service role) compares the verified Google email to FAST_STORE_ADMIN_EMAILS
-- and writes/removes the 'admin' row in user_roles.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type app_role as enum ('user','developer','admin');
create type verification_status as enum
  ('not_started','incomplete','submitted','under_review','changes_requested','approved','rejected','suspended');
create type app_status as enum
  ('draft','submitted','validation_failed','pending_review','published','rejected','unpublished','suspended');
create type account_type as enum ('individual','organization');

-- ---------- identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role = 'admin');
$$;

create function can_publish() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from developer_permissions
    where developer_id = auth.uid() and can_publish and revoked_at is null
  ) and not exists (select 1 from profiles where id = auth.uid() and suspended);
$$;

-- auto-create profile on first Google login
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then return new; end if;
  insert into profiles(id,email,full_name,avatar_url)
  values (new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  insert into user_roles(user_id,role) values (new.id,'user') on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- developers & verification ----------
create table developer_profiles (
  id uuid primary key references profiles(id) on delete cascade,
  legal_name text not null,
  display_name text not null,
  account_type account_type not null,
  country text not null,
  description text,
  status verification_status not null default 'not_started',
  created_at timestamptz not null default now()
);

create table developer_permissions (
  developer_id uuid primary key references developer_profiles(id) on delete cascade,
  can_publish boolean not null default false,
  granted_by uuid references profiles(id),
  granted_at timestamptz,
  revoked_at timestamptz,
  reason text
);

create table verification_requirement_definitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text,
  kind text not null check (kind in ('document','test_apk','field','screenshot')),
  mandatory boolean not null default true,
  accepted_formats text[] not null default '{}',
  max_size_mb int not null default 20 check (max_size_mb > 0),
  applies_to text not null default 'both' check (applies_to in ('new','resubmission','both')),
  enabled boolean not null default true,
  sort_order int not null default 0
);

create table developer_verification_applications (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references developer_profiles(id) on delete cascade,
  status verification_status not null default 'incomplete',
  requirement_snapshot jsonb not null,           -- frozen copy of requirements at submission
  answers jsonb not null default '{}',
  test_app_name text, test_package_name text, test_version_name text, test_description text,
  decision_by uuid references profiles(id),
  decision_reason text,
  decided_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on developer_verification_applications(status);

create table verification_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references developer_verification_applications(id) on delete cascade,
  requirement_id uuid references verification_requirement_definitions(id),
  storage_path text not null,                    -- private bucket; signed URLs only
  original_name text not null,
  size_bytes bigint not null check (size_bytes > 0),
  mime_type text,
  created_at timestamptz not null default now()
);

-- ---------- catalogue ----------
create table app_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order int not null default 0
);

create table apps (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references developer_profiles(id),
  category_id uuid references app_categories(id),
  slug text not null unique,
  name text not null,
  package_name text not null unique check (package_name ~ '^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$'),
  short_description text not null check (char_length(short_description) <= 80),
  full_description text,
  icon_path text,
  status app_status not null default 'draft',
  featured boolean not null default false,
  decision_reason text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index apps_status_idx on apps(status);
create index apps_name_trgm on apps using gin (name gin_trgm_ops);

create table app_versions (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  version_name text not null,
  version_code bigint not null check (version_code > 0),
  min_android_sdk int not null,
  apk_path text not null,
  apk_size_bytes bigint not null check (apk_size_bytes > 0),
  apk_sha256 text,
  release_notes text,
  validation jsonb not null default '{}',         -- validation results
  malware_scan jsonb,                             -- kept separate from validation
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (app_id, version_code)
);

create table app_screenshots (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0
);

create table app_download_events (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  version_id uuid not null references app_versions(id),
  user_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index on app_download_events(app_id, created_at);

create table app_reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (app_id, user_id)
);

create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  primary key (user_id, app_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id),
  app_id uuid references apps(id) on delete cascade,
  review_id uuid references app_reviews(id) on delete cascade,
  reason text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);
insert into platform_settings(key,value) values
  ('publishing_mode','"admin_review"'),          -- or "auto_after_validation"
  ('max_apk_mb','200');

create table admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table developer_profiles enable row level security;
alter table developer_permissions enable row level security;
alter table verification_requirement_definitions enable row level security;
alter table developer_verification_applications enable row level security;
alter table verification_documents enable row level security;
alter table app_categories enable row level security;
alter table apps enable row level security;
alter table app_versions enable row level security;
alter table app_screenshots enable row level security;
alter table app_download_events enable row level security;
alter table app_reviews enable row level security;
alter table favorites enable row level security;
alter table notifications enable row level security;
alter table abuse_reports enable row level security;
alter table platform_settings enable row level security;
alter table admin_audit_logs enable row level security;

-- profiles: own row (limited columns updated via API), admins read all
create policy profiles_self_read on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_self_update on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and suspended = (select suspended from profiles where id = auth.uid()));

-- roles & permissions: read-only from client; writes only via service role
create policy roles_read on user_roles for select using (user_id = auth.uid() or is_admin());
create policy perms_read on developer_permissions for select using (developer_id = auth.uid() or is_admin());

-- developer profile
create policy dev_read on developer_profiles for select using (true);
create policy dev_insert on developer_profiles for insert with check (id = auth.uid() and status = 'not_started');
create policy dev_update on developer_profiles for update using (id = auth.uid())
  with check (id = auth.uid() and status = (select status from developer_profiles where id = auth.uid()));

-- requirements: everyone signed in reads enabled; admin manages
create policy req_read on verification_requirement_definitions for select
  using (auth.uid() is not null and (enabled or is_admin()));
create policy req_admin on verification_requirement_definitions for all using (is_admin()) with check (is_admin());

-- verification applications: owner may edit only before submission; decisions are admin-only
create policy va_read on developer_verification_applications for select using (developer_id = auth.uid() or is_admin());
create policy va_insert on developer_verification_applications for insert
  with check (developer_id = auth.uid() and status = 'incomplete');
create policy va_owner_update on developer_verification_applications for update
  using (developer_id = auth.uid() and status in ('incomplete','changes_requested'))
  with check (developer_id = auth.uid() and status in ('incomplete','changes_requested','submitted'));
create policy va_admin_update on developer_verification_applications for update using (is_admin()) with check (is_admin());

create policy vd_read on verification_documents for select using (
  is_admin() or exists (select 1 from developer_verification_applications a
                        where a.id = application_id and a.developer_id = auth.uid()));
create policy vd_insert on verification_documents for insert with check (
  exists (select 1 from developer_verification_applications a
          where a.id = application_id and a.developer_id = auth.uid()
            and a.status in ('incomplete','changes_requested')));

-- categories
create policy cat_read on app_categories for select using (true);
create policy cat_admin on app_categories for all using (is_admin()) with check (is_admin());

-- apps: public sees published only; developer sees/edits own; publishing needs can_publish()
create policy apps_public on apps for select using (status = 'published' or developer_id = auth.uid() or is_admin());
create policy apps_insert on apps for insert
  with check (developer_id = auth.uid() and can_publish() and status = 'draft');
create policy apps_owner_update on apps for update
  using (developer_id = auth.uid() and can_publish())
  with check (developer_id = auth.uid() and can_publish() and status in ('draft','submitted','pending_review','unpublished'));
create policy apps_admin on apps for all using (is_admin()) with check (is_admin());
-- NOTE: auto-publication (Mode B) must happen in the `publish-app` Edge Function, never from the client.

create policy av_read on app_versions for select using (
  is_admin() or exists (select 1 from apps a where a.id = app_id and (a.status='published' or a.developer_id = auth.uid())));
create policy av_owner_write on app_versions for insert with check (
  can_publish() and exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()));
create policy ss_read on app_screenshots for select using (
  exists (select 1 from apps a where a.id = app_id and (a.status='published' or a.developer_id = auth.uid() or is_admin())));
create policy ss_owner_write on app_screenshots for all
  using (exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()))
  with check (exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()));

-- downloads: inserted only by the `download-apk` Edge Function; visible to the app's developer and admins
create policy dl_read on app_download_events for select using (
  is_admin() or user_id = auth.uid()
  or exists (select 1 from apps a where a.id = app_id and a.developer_id = auth.uid()));

-- reviews / favorites / notifications / reports
create policy rev_read on app_reviews for select using (not hidden or user_id = auth.uid() or is_admin());
create policy rev_write on app_reviews for insert with check (user_id = auth.uid());
create policy rev_update on app_reviews for update using (user_id = auth.uid()) with check (user_id = auth.uid() and hidden = false);
create policy rev_delete on app_reviews for delete using (user_id = auth.uid() or is_admin());
create policy rev_admin on app_reviews for update using (is_admin()) with check (is_admin());

create policy fav_all on favorites for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_read on notifications for select using (user_id = auth.uid());
create policy notif_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rep_insert on abuse_reports for insert with check (reporter_id = auth.uid());
create policy rep_admin on abuse_reports for select using (is_admin());
create policy rep_admin_upd on abuse_reports for update using (is_admin()) with check (is_admin());

create policy settings_read on platform_settings for select using (true);
create policy settings_admin on platform_settings for all using (is_admin()) with check (is_admin());
create policy audit_read on admin_audit_logs for select using (is_admin());   -- inserts via service role only

-- ---------- storage buckets ----------
insert into storage.buckets (id, name, public) values
  ('app-icons','app-icons',true),
  ('app-screenshots','app-screenshots',true),
  ('verification-docs','verification-docs',false),
  ('test-apks','test-apks',false),
  ('published-apks','published-apks',false)   -- served only via signed URLs from download-apk
on conflict do nothing;

-- private buckets: first path segment must be the uploader's user id
create policy vdocs_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('verification-docs','test-apks') and (storage.foldername(name))[1] = auth.uid()::text);
create policy vdocs_read on storage.objects for select to authenticated
  using (bucket_id in ('verification-docs','test-apks')
         and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy icons_owner_write on storage.objects for insert to authenticated
  with check (bucket_id in ('app-icons','app-screenshots') and can_publish()
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy apk_owner_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'published-apks' and can_publish() and (storage.foldername(name))[1] = auth.uid()::text);
create policy apk_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'published-apks' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
