create table if not exists public.career_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Career guidance chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.career_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.career_conversations(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_career_conversations_user_id on public.career_conversations(user_id);
create index if not exists idx_career_conversations_updated_at on public.career_conversations(updated_at);
create index if not exists idx_career_messages_conversation_id on public.career_messages(conversation_id);

create trigger career_conversations_updated_at before update on public.career_conversations for each row execute function public.set_updated_at();

alter table public.career_conversations enable row level security;
alter table public.career_messages enable row level security;

create policy career_conversations_owner_all on public.career_conversations
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy career_messages_owner_all on public.career_messages
for all using (
  exists (
    select 1 from public.career_conversations cc
    where cc.id = conversation_id and cc.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.career_conversations cc
    where cc.id = conversation_id and cc.user_id = auth.uid()
  )
);
