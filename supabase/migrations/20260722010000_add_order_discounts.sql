-- Senior Citizen (RA 9994) / PWD (RA 10754) discount support.
-- See src/db/schema.ts OrderDiscount/OrderLine for the matching Dexie (local) schema.

-- ---------- Order Discounts ----------
create table if not exists order_discounts (
  id text primary key,
  order_id text not null,
  discount_type text not null check (discount_type in ('senior', 'pwd')),
  holder_name text not null,
  id_number text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_discounts_order_id_idx on order_discounts (order_id);
create index if not exists order_discounts_updated_at_idx on order_discounts (updated_at);

alter table order_discounts enable row level security;
drop policy if exists anon_full_access on order_discounts;
create policy anon_full_access on order_discounts for all to anon using (true) with check (true);

-- ---------- Order Lines: link to the discount claim (if any) covering this line ----------
alter table order_lines add column if not exists order_discount_id text;
create index if not exists order_lines_order_discount_id_idx on order_lines (order_discount_id);
