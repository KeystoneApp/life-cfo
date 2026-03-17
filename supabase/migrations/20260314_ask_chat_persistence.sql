create table if not exists public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  path text not null,
  scope text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tone text null,
  verdict text null,
  action_href text null,
  created_at timestamptz not null default now()
);

create index if not exists ask_conversations_user_household_path_scope_updated_idx
  on public.ask_conversations (user_id, household_id, path, scope, updated_at desc);

create index if not exists ask_messages_conversation_created_idx
  on public.ask_messages (conversation_id, created_at asc);

alter table public.ask_conversations enable row level security;
alter table public.ask_messages enable row level security;

create policy ask_conversations_select_own
  on public.ask_conversations
  for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_conversations.household_id
        and hm.user_id = auth.uid()
    )
  );

create policy ask_conversations_insert_own
  on public.ask_conversations
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_conversations.household_id
        and hm.user_id = auth.uid()
    )
  );

create policy ask_conversations_update_own
  on public.ask_conversations
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_conversations.household_id
        and hm.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_conversations.household_id
        and hm.user_id = auth.uid()
    )
  );

create policy ask_conversations_delete_own
  on public.ask_conversations
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_conversations.household_id
        and hm.user_id = auth.uid()
    )
  );

create policy ask_messages_select_own
  on public.ask_messages
  for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_messages.household_id
        and hm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ask_conversations c
      where c.id = ask_messages.conversation_id
        and c.user_id = auth.uid()
        and c.household_id = ask_messages.household_id
    )
  );

create policy ask_messages_insert_own
  on public.ask_messages
  for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_messages.household_id
        and hm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ask_conversations c
      where c.id = ask_messages.conversation_id
        and c.user_id = auth.uid()
        and c.household_id = ask_messages.household_id
    )
  );

create policy ask_messages_update_own
  on public.ask_messages
  for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_messages.household_id
        and hm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ask_conversations c
      where c.id = ask_messages.conversation_id
        and c.user_id = auth.uid()
        and c.household_id = ask_messages.household_id
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_messages.household_id
        and hm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ask_conversations c
      where c.id = ask_messages.conversation_id
        and c.user_id = auth.uid()
        and c.household_id = ask_messages.household_id
    )
  );

create policy ask_messages_delete_own
  on public.ask_messages
  for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = ask_messages.household_id
        and hm.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.ask_conversations c
      where c.id = ask_messages.conversation_id
        and c.user_id = auth.uid()
        and c.household_id = ask_messages.household_id
    )
  );
