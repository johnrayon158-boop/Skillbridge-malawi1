create policy employer_employee_profile_read on public.profiles
for select using (
  exists (
    select 1
    from public.employment e
    where e.student_id = profiles.id
      and e.employer_id = auth.uid()
  )
);

create policy employer_employee_student_profile_read on public.student_profiles
for select using (
  exists (
    select 1
    from public.employment e
    where e.student_id = student_profiles.id
      and e.employer_id = auth.uid()
  )
);
