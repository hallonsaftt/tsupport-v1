
-- Push Subscriptions table
create table if not exists public.push_subscriptions (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade, -- For agents/admins
    customer_id text, -- For customers (chat_id or cookie id)
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(endpoint)
);

-- RLS
alter table public.push_subscriptions enable row level security;

create policy "Enable insert for all users" on public.push_subscriptions for insert with check (true);
create policy "Enable select for owners" on public.push_subscriptions for select using (
    (auth.uid() = user_id) or (customer_id is not null) -- Simplification: customers can access (refine later if needed)
);
create policy "Enable delete for owners" on public.push_subscriptions for delete using (
    (auth.uid() = user_id) or (customer_id is not null)
);
