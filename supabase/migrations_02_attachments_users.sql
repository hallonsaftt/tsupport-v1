-- Add attachments to messages
alter table public.messages
add column if not exists attachment_url text,
add column if not exists attachment_type text,
add column if not exists attachment_name text;

-- Create allowed_users table for dynamic ID validation
create table if not exists public.allowed_users (
  id uuid default gen_random_uuid() primary key,
  customer_id text not null unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS for allowed_users
alter table public.allowed_users enable row level security;

-- Policies for allowed_users
-- Note: If these policies already exist, these commands might fail. 
-- In that case, you can ignore the error or drop the policies first.
do $$ 
begin
    if not exists (select 1 from pg_policies where policyname = 'Enable read access for all users' and tablename = 'allowed_users') then
        create policy "Enable read access for all users" on public.allowed_users for select using (true);
    end if;
    
    if not exists (select 1 from pg_policies where policyname = 'Enable insert for all users' and tablename = 'allowed_users') then
        create policy "Enable insert for all users" on public.allowed_users for insert with check (true);
    end if;

    if not exists (select 1 from pg_policies where policyname = 'Enable delete for all users' and tablename = 'allowed_users') then
        create policy "Enable delete for all users" on public.allowed_users for delete using (true);
    end if;
end $$;

-- Create storage bucket for chat attachments
insert into storage.buckets (id, name, public) 
values ('chat-attachments', 'chat-attachments', true)
on conflict (id) do nothing;

-- Storage policies
do $$ 
begin
    if not exists (select 1 from pg_policies where policyname = 'Public Access Chat Attachments' and tablename = 'objects' and schemaname = 'storage') then
        create policy "Public Access Chat Attachments" on storage.objects for select using ( bucket_id = 'chat-attachments' );
    end if;

    if not exists (select 1 from pg_policies where policyname = 'Public Upload Chat Attachments' and tablename = 'objects' and schemaname = 'storage') then
        create policy "Public Upload Chat Attachments" on storage.objects for insert with check ( bucket_id = 'chat-attachments' );
    end if;
end $$;
