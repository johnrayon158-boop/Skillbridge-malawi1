do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cv_analyses'
      and column_name = 'storage_path'
  ) then
    alter table public.cv_analyses
      alter column storage_path drop not null;
  end if;
end
$$;
