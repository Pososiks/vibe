create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  creem_customer_id      text,
  creem_subscription_id  text not null unique,
  status                 text not null,
  product_id             text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

-- Owner can read their own subscription rows. No write policy: only the
-- service-role webhook (which bypasses RLS) ever writes here.
create policy "Subscriptions are viewable by their owner"
  on public.subscriptions
  for select
  using (auth.uid() = user_id);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_profiles_updated_at();
