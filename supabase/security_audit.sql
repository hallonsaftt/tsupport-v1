-- Security Audit & Hardening

-- 1. Hardening Agents Table
-- We want agents.id to match auth.users.id for authenticated agents
alter table public.agents alter column id drop default;
alter table public.agents add column if not exists email text;
alter table public.agents add column if not exists user_id uuid references auth.users(id);

-- Fix RLS for Agents
drop policy if exists "Enable read access for all users" on public.agents;
drop policy if exists "Enable write access for all users" on public.agents;
drop policy if exists "Enable update for all users" on public.agents;
drop policy if exists "Enable delete for all users" on public.agents;

-- Allow public to read agents (needed for customer chat to show agent name/avatar)
create policy "Public read agents" on public.agents for select using (true);

-- Allow authenticated users (Admins) to insert/update their OWN profile
create policy "Auth insert agents" on public.agents for insert with check (auth.uid() = id);
create policy "Auth update agents" on public.agents for update using (auth.uid() = id);

-- 2. Hardening Chats Table
-- Revoke DELETE from public
drop policy if exists "Enable insert for all users" on public.chats;
drop policy if exists "Enable select for all users" on public.chats;
drop policy if exists "Enable update for all users" on public.chats;

-- Allow public insert (Customers starting chat)
create policy "Public insert chats" on public.chats for insert with check (true);

-- Allow public select (Customers viewing chat - Note: UUID protection only)
create policy "Public select chats" on public.chats for select using (true);

-- Allow public update (Customers rating/closing)
create policy "Public update chats" on public.chats for update using (true);

-- Allow authenticated admins to Delete chats
create policy "Auth delete chats" on public.chats for delete using (auth.role() = 'authenticated');

-- 3. Hardening Messages Table
drop policy if exists "Enable insert for all users" on public.messages;
drop policy if exists "Enable select for all users" on public.messages;

-- Public access for messages (Required for anonymous customers)
create policy "Public insert messages" on public.messages for insert with check (true);
create policy "Public select messages" on public.messages for select using (true);

-- 4. Clean up seeded agents if they conflict (Optional, but good for cleanliness)
-- delete from public.agents where id not in (select id from auth.users);
