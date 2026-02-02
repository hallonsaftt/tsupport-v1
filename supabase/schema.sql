-- Enable Realtime
drop publication if exists supabase_realtime;
create publication supabase_realtime;

-- Create chats table
create table public.chats (
  id uuid default gen_random_uuid() primary key,
  customer_id text not null,
  subject text not null,
  customer_email text,
  status text default 'active' check (status in ('active', 'closed')),
  agent_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  transcript_id uuid unique -- For public sharing
);

-- Create messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  chat_id uuid references public.chats(id) on delete cascade not null,
  content text not null,
  sender_role text not null check (sender_role in ('agent', 'customer', 'system')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create agents table (simple list of names for dropdown)
create table public.agents (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed agents
insert into public.agents (name) values ('Nikola'), ('Petar'), ('Emilija');

-- Enable Realtime for specific tables
alter publication supabase_realtime add table public.chats;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.agents;

-- RLS Policies
-- Enable RLS
alter table public.chats enable row level security;
alter table public.messages enable row level security;
alter table public.agents enable row level security;

-- Policies (Simplified for MVP, assuming Auth is handled via Supabase Auth for admins)
-- Customers have "public" access via their ID token logic, but for now we'll allow public insert/select for chats/messages 
-- IF we implement strict RLS we need a way to identify the "customer" session. 
-- Since customer auth is just "Enter ID", we rely on the client knowing the Chat ID.

-- Allow anyone to create a chat
create policy "Enable insert for all users" on public.chats for insert with check (true);

-- Allow anyone to read chats (In a real app, you'd restrict this to the creator or admin)
-- For MVP: Allow public read so the client can subscribe to updates
create policy "Enable select for all users" on public.chats for select using (true);

-- Update chats (for closing or assigning agent)
create policy "Enable update for all users" on public.chats for update using (true);

-- Messages
create policy "Enable insert for all users" on public.messages for insert with check (true);
create policy "Enable select for all users" on public.messages for select using (true);

-- Agents
create policy "Enable read access for all users" on public.agents for select using (true);
create policy "Enable write access for all users" on public.agents for insert with check (true);
create policy "Enable update for all users" on public.agents for update using (true);
create policy "Enable delete for all users" on public.agents for delete using (true);
