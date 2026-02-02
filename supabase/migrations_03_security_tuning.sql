-- Security Tuning Migration
-- This file restricts write access to sensitive tables to authenticated users (admins) only,
-- while keeping necessary public access for customers.

-- Agents: Only admins (authenticated) can manage agents
drop policy if exists "Enable write access for all users" on public.agents;
drop policy if exists "Enable update for all users" on public.agents;
drop policy if exists "Enable delete for all users" on public.agents;

create policy "Enable insert for authenticated only" on public.agents for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated only" on public.agents for update using (auth.role() = 'authenticated');
create policy "Enable delete for authenticated only" on public.agents for delete using (auth.role() = 'authenticated');

-- Allowed Users: Only admins can manage the allowed list
drop policy if exists "Enable insert for all users" on public.allowed_users;
drop policy if exists "Enable delete for all users" on public.allowed_users;

create policy "Enable insert for authenticated only" on public.allowed_users for insert with check (auth.role() = 'authenticated');
create policy "Enable delete for authenticated only" on public.allowed_users for delete using (auth.role() = 'authenticated');

-- Chats: Ensure rating column exists (idempotent)
do $$ 
begin
    if not exists (select 1 from information_schema.columns where table_name = 'chats' and column_name = 'rating') then
        alter table public.chats add column rating integer check (rating >= 1 and rating <= 5);
    end if;

    if not exists (select 1 from information_schema.columns where table_name = 'chats' and column_name = 'review_comment') then
        alter table public.chats add column review_comment text;
    end if;
end $$;
