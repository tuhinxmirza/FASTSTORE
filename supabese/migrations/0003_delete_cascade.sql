-- Allow admins to delete categories and requirements that are already referenced.
alter table apps drop constraint if exists apps_category_id_fkey;
alter table apps add constraint apps_category_id_fkey
  foreign key (category_id) references app_categories(id) on delete set null;

alter table verification_documents drop constraint if exists verification_documents_requirement_id_fkey;
alter table verification_documents add constraint verification_documents_requirement_id_fkey
  foreign key (requirement_id) references verification_requirement_definitions(id) on delete set null;
