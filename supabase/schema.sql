create extension if not exists pgcrypto;

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id text not null references public.organizations(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(), org_id text not null references public.organizations(id) on delete cascade,
  name text not null, account_type text not null default 'cash', balance numeric(14,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(), org_id text not null references public.organizations(id) on delete cascade,
  type text not null, date date not null default current_date, party text, amount numeric(14,2) not null default 0,
  status text not null default 'Aktif', note text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.debt_plans (
  id uuid primary key default gen_random_uuid(), org_id text not null references public.organizations(id) on delete cascade,
  type text, party text not null, amount numeric(14,2) not null default 0, paid numeric(14,2) not null default 0,
  due_date date, priority text default 'Normal', status text default 'Planlandı', note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(), org_id text not null references public.organizations(id) on delete cascade,
  code text, name text not null, item_class text, current_qty numeric(14,3) not null default 0,
  min_qty numeric(14,3) not null default 0, unit text, cost numeric(14,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.production_jobs (
  id uuid primary key default gen_random_uuid(), org_id text not null references public.organizations(id) on delete cascade,
  product_name text not null, size text, quantity numeric(14,3) not null default 1,
  stage text default 'Planlandı', responsible text, due_date date, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

insert into public.organizations (id, name) values ('mirac','Miraç Yatak Baza') on conflict (id) do nothing;

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.debt_plans enable row level security;
alter table public.items enable row level security;
alter table public.production_jobs enable row level security;

create or replace function public.is_org_member(target_org text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.members m where m.user_id = auth.uid() and m.org_id = target_org and m.active = true)
$$;

create policy "members read own membership" on public.members for select using (user_id = auth.uid());
create policy "org members read accounts" on public.accounts for select using (public.is_org_member(org_id));
create policy "org editors write accounts" on public.accounts for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members read transactions" on public.transactions for select using (public.is_org_member(org_id));
create policy "org editors write transactions" on public.transactions for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members read debts" on public.debt_plans for select using (public.is_org_member(org_id));
create policy "org editors write debts" on public.debt_plans for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members read items" on public.items for select using (public.is_org_member(org_id));
create policy "org editors write items" on public.items for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy "org members read jobs" on public.production_jobs for select using (public.is_org_member(org_id));
create policy "org editors write jobs" on public.production_jobs for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- İlk kullanıcı Supabase Auth üzerinden oluşturulduktan sonra SQL Editor'da çalıştır:
-- insert into public.members(user_id, org_id, role, active) values ('KULLANICI_UUID','mirac','owner',true);
