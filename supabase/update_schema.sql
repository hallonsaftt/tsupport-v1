-- Add rating and review to chats
alter table public.chats 
add column rating integer check (rating >= 1 and rating <= 5),
add column review_comment text;

-- Add avatar_url to agents
alter table public.agents
add column avatar_url text;

-- Add attachments to messages
alter table public.messages
add column attachment_url text,
add column attachment_type text,
add column attachment_name text;

-- Create allowed_users table for dynamic ID validation
create table public.allowed_users (
  id uuid default gen_random_uuid() primary key,
  customer_id text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for allowed_users
alter table public.allowed_users enable row level security;
create policy "Enable read access for all users" on public.allowed_users for select using (true);
create policy "Enable insert for all users" on public.allowed_users for insert with check (true);
create policy "Enable delete for all users" on public.allowed_users for delete using (true);

-- Create storage bucket for chat attachments
insert into storage.buckets (id, name, public) 
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

-- Storage policies (adjust as needed for security)
create policy "Public Access" on storage.objects for select using ( bucket_id = 'chat-attachments' );
create policy "Public Upload" on storage.objects for insert with check ( bucket_id = 'chat-attachments' );
