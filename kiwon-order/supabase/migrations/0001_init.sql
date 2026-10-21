-- KIWON 통합 발주관리: 초기 스키마
-- 원칙
--  1) 등록된 직원(app_users, active)만 데이터를 볼 수 있음 (RLS)
--  2) 쓰기는 전부 서버 함수(RPC)로만 — 권한·수량·버전 검증을 DB 안에서 처리
--  3) 납품이력·수정이력은 수정/삭제 불가 (정정은 새 행으로)

create extension if not exists pgcrypto;

-- ───────── 직원(허용 목록) ─────────
create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  name text not null,
  aliases text[] not null default '{}',
  role text not null check (role in ('ADMIN','STAFF','VIEWER')),
  active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  aliases text[] not null default '{}',
  kind text not null default 'B2B' check (kind in ('B2B','ONLINE_PERSON','INTERNAL','OVERSEAS')),
  contact text,
  shipping_method text,
  shipping_branch text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  code text primary key,
  barcode text,
  name text not null,
  spec text,
  unit text,
  last_price numeric,
  currency text not null default 'KRW'
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid references public.app_users(id),
  file_name text not null,
  file_hash text not null,
  mode text not null check (mode in ('MIGRATION','DAILY')),
  sheets text[] not null default '{}',
  total int not null default 0,
  inserted int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  errors int not null default 0
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  order_date date not null,
  order_type text not null default 'GENERAL',
  customer_id uuid references public.customers(id),
  customer_name text not null,
  channel text not null default 'DIRECT',
  requester text,
  assignee_id uuid references public.app_users(id),
  due_date date,
  memo text,
  source text not null check (source in ('MANUAL','EXCEL_DAILY','EXCEL_MIGRATION')),
  import_batch_id uuid references public.import_batches(id),
  is_test boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users(id)
);
create index on public.orders(order_date);
create index on public.orders(customer_id);
create index on public.orders(assignee_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  line_no int not null,
  product_code text,
  barcode text,
  product_name text not null,
  spec text,
  qty numeric not null check (qty >= 0),
  cancelled_qty numeric not null default 0 check (cancelled_qty >= 0 and cancelled_qty <= qty),
  unit text,
  unit_price numeric check (unit_price is null or unit_price >= 0), -- null = 미입력, 0 = 0원
  price_note text,
  currency text not null default 'KRW',
  assignee_id uuid references public.app_users(id),
  due_date date,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','CONFIRMED','IN_PRODUCTION','READY','PARTIAL','DELIVERED','ON_HOLD','CANCELLED')),
  supplier text,
  memo text,
  note text,
  attrs jsonb,
  unique (order_id, line_no)
);
create index on public.order_items(product_code);
create index on public.order_items(assignee_id);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.order_items(id) on delete cascade,
  kind text not null check (kind in ('DELIVERY','RETURN','VOID')),
  date date not null,
  qty numeric not null check (qty > 0),
  voids_id uuid references public.deliveries(id),
  handler_id uuid references public.app_users(id),
  memo text,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),
  check ((kind = 'VOID') = (voids_id is not null))
);
create index on public.deliveries(item_id);
create unique index deliveries_void_once on public.deliveries(voids_id) where voids_id is not null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  user_id uuid references public.app_users(id),
  entity text not null,
  entity_id uuid,
  order_id uuid,
  action text not null,
  field text,
  before text,
  after text
);
create index on public.audit_logs(order_id);
create index on public.audit_logs(at desc);

create table public.legacy_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id),
  sheet text not null,
  row_no int not null,
  raw jsonb not null,
  flags jsonb,
  fingerprint text not null,
  item_id uuid references public.order_items(id) on delete set null,
  issues text[] not null default '{}'
);
create index on public.legacy_rows(fingerprint);
create index on public.legacy_rows(item_id);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}',
  columns text[] not null default '{}',
  page_size int not null default 50,
  sort jsonb,
  created_at timestamptz not null default now()
);

create table public.order_no_seq (key text primary key, last_no int not null);

-- ───────── 보조 함수 ─────────
create or replace function public.my_app_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.app_users where auth_user_id = auth.uid() and active limit 1
$$;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.app_users where auth_user_id = auth.uid() and active limit 1
$$;

create or replace function public.require_writer() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare r text := public.my_role(); begin
  if r is null then raise exception '로그인이 필요하거나 등록되지 않은 사용자입니다.' using errcode = '42501'; end if;
  if r not in ('ADMIN','STAFF') then raise exception '조회 전용 사용자는 수정할 수 없습니다.' using errcode = '42501'; end if;
  return public.my_app_user_id();
end $$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = public as $$ begin
  if public.my_role() is distinct from 'ADMIN' then raise exception '관리자만 할 수 있습니다.' using errcode = '42501'; end if;
  return public.my_app_user_id();
end $$;

-- 거래처 중복 판정용 이름 (앱의 normalizeName 과 같은 규칙)
create or replace function public.normalize_name(s text) returns text
language sql immutable as $$
  select lower(regexp_replace(regexp_replace(coalesce(s,''), '\(주\)|㈜|주식회사|\(유\)|유한회사', '', 'g'), '[[:space:]·.,\-_()（）]', '', 'g'))
$$;

create or replace function public.net_delivered(p_item uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(case d.kind when 'DELIVERY' then d.qty when 'RETURN' then -d.qty end), 0)
  from public.deliveries d
  where d.item_id = p_item and d.kind <> 'VOID'
    and not exists (select 1 from public.deliveries v where v.voids_id = d.id)
$$;

create or replace function public.next_order_no(p_prefix text, p_date date) returns text
language plpgsql security definer set search_path = public as $$
declare k text := p_prefix || '-' || to_char(p_date, 'YYMMDD'); n int; begin
  insert into public.order_no_seq(key, last_no) values (k, 1)
  on conflict (key) do update set last_no = public.order_no_seq.last_no + 1
  returning last_no into n;
  return k || '-' || lpad(n::text, 3, '0');
end $$;

create or replace function public.audit(p_user uuid, p_entity text, p_entity_id uuid, p_order uuid, p_action text, p_field text, p_before text, p_after text)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs(user_id, entity, entity_id, order_id, action, field, before, after)
  values (p_user, p_entity, p_entity_id, p_order, p_action, p_field, p_before, p_after)
$$;

-- jsonb 패치를 허용된 컬럼에만 적용하고 변경 전/후를 기록 (orders / order_items 공용)
create or replace function public.apply_patch(p_table text, p_id uuid, p_order uuid, p_patch jsonb, p_allowed text[], p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; old jsonb; changed int := 0; begin
  execute format('select to_jsonb(t) from public.%I t where id = $1', p_table) into old using p_id;
  if old is null then raise exception '대상을 찾을 수 없습니다.'; end if;
  for k, v in select * from jsonb_each(coalesce(p_patch, '{}'::jsonb)) loop
    if not k = any(p_allowed) then raise exception '수정할 수 없는 항목입니다: %', k; end if;
    if v = 'null'::jsonb then v := null; end if;
    if (old -> k) is distinct from v and coalesce(old ->> k, '') is distinct from coalesce(v #>> '{}', '') then
      execute format('update public.%I set %I = (jsonb_populate_record(null::public.%I, jsonb_build_object(%L, $1))).%I where id = $2',
                     p_table, k, p_table, k, k) using v, p_id;
      perform public.audit(p_user, case p_table when 'orders' then 'order' else 'item' end, p_id, p_order,
                           case k when 'status' then 'STATUS' else 'UPDATE' end, k, old ->> k, v #>> '{}');
      changed := changed + 1;
    end if;
  end loop;
  return changed;
end $$;

-- ───────── 업무 함수 (RPC) ─────────

-- 신규 발주: 번호 채번 + 품목 저장을 한 트랜잭션으로
create or replace function public.create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); oid uuid := gen_random_uuid(); no text; it jsonb; n int := 0; cust uuid;
begin
  if coalesce(trim(p->>'customerName'), '') = '' then raise exception '거래처를 입력하세요.'; end if;
  if (p->>'orderDate') is null then raise exception '발주일을 입력하세요.'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception '품목을 1개 이상 입력하세요.'; end if;
  cust := nullif(p->>'customerId', '')::uuid;
  if cust is null then
    select id into cust from public.customers where normalized_name = public.normalize_name(p->>'customerName');
  end if;
  no := public.next_order_no('KW', (p->>'orderDate')::date);
  insert into public.orders(id, order_no, order_date, order_type, customer_id, customer_name, channel, requester, assignee_id, due_date, memo, source, is_test, created_by, updated_by)
  values (oid, no, (p->>'orderDate')::date, coalesce(p->>'orderType', 'GENERAL'), cust, trim(p->>'customerName'), coalesce(p->>'channel', 'DIRECT'),
          nullif(p->>'requester', ''), nullif(p->>'assigneeId', '')::uuid, nullif(p->>'dueDate', '')::date, nullif(p->>'memo', ''),
          'MANUAL', coalesce((p->>'isTest')::boolean, false), me, me);
  for it in select * from jsonb_array_elements(p->'items') loop
    n := n + 1;
    if coalesce((it->>'qty')::numeric, 0) <= 0 then raise exception '%번째 품목의 수량을 확인하세요.', n; end if;
    if (it->>'unitPrice') is not null and (it->>'unitPrice')::numeric < 0 then raise exception '%번째 품목의 단가를 확인하세요.', n; end if;
    insert into public.order_items(order_id, line_no, product_code, barcode, product_name, spec, qty, unit, unit_price, price_note, currency, assignee_id, due_date, status, supplier, memo, note)
    values (oid, n, nullif(it->>'productCode', ''), nullif(it->>'barcode', ''), coalesce(nullif(trim(it->>'productName'), ''), it->>'productCode'), nullif(it->>'spec', ''),
            (it->>'qty')::numeric, nullif(it->>'unit', ''), (it->>'unitPrice')::numeric, nullif(it->>'priceNote', ''), coalesce(it->>'currency', 'KRW'),
            nullif(it->>'assigneeId', '')::uuid, nullif(it->>'dueDate', '')::date, 'RECEIVED', nullif(it->>'supplier', ''), nullif(it->>'memo', ''), nullif(it->>'note', ''));
  end loop;
  perform public.audit(me, 'order', oid, oid, 'CREATE', null, null, no || ' (' || n || '품목)');
  return jsonb_build_object('id', oid, 'orderNo', no);
end $$;

-- 버전 확인 (다른 사람이 먼저 고쳤으면 충돌)
create or replace function public.lock_order_version(p_order uuid, p_version int) returns void
language plpgsql security definer set search_path = public as $$
declare v int; begin
  select version into v from public.orders where id = p_order for update;
  if v is null then raise exception '발주를 찾을 수 없습니다.'; end if;
  if p_version is not null and v <> p_version then
    raise exception 'CONFLICT' using errcode = 'P0409', detail = v::text;
  end if;
end $$;

create or replace function public.bump_order(p_order uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.orders set version = version + 1, updated_at = now(), updated_by = p_user where id = p_order
$$;

create or replace function public.update_order(p_id uuid, p_version int, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); begin
  perform public.lock_order_version(p_id, p_version);
  if public.apply_patch('orders', p_id, p_id, p_patch,
       array['memo','assignee_id','due_date','customer_name','customer_id','requester','channel','order_date','order_type'], me) > 0 then
    perform public.bump_order(p_id, me);
  end if;
end $$;

create or replace function public.update_item(p_id uuid, p_version int, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); oid uuid; r public.order_items; delivered numeric; begin
  select order_id into oid from public.order_items where id = p_id;
  if oid is null then raise exception '품목을 찾을 수 없습니다.'; end if;
  perform public.lock_order_version(oid, p_version);
  perform 1 from public.order_items where id = p_id for update;
  if public.apply_patch('order_items', p_id, oid, p_patch,
       array['status','assignee_id','due_date','qty','cancelled_qty','memo','note','spec','unit','unit_price','price_note','supplier','product_name','product_code','barcode','currency'], me) > 0 then
    select * into r from public.order_items where id = p_id;
    delivered := public.net_delivered(p_id);
    if r.qty <= 0 then raise exception '발주수량은 0보다 커야 합니다.'; end if;
    if r.qty - r.cancelled_qty < delivered then
      raise exception '이미 %개 납품되어 그보다 줄일 수 없습니다. 반품을 먼저 등록하세요.', delivered;
    end if;
    perform public.bump_order(oid, me);
  end if;
end $$;

-- 납품/반품: 품목 행을 잠근 뒤 미납·누적수량을 다시 계산해 초과를 막음
create or replace function public.add_delivery(p_item uuid, p_kind text, p_qty numeric, p_date date, p_memo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); r public.order_items; delivered numeric; remain numeric; did uuid; begin
  if p_kind not in ('DELIVERY','RETURN') then raise exception '구분이 올바르지 않습니다.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception '수량은 1 이상이어야 합니다.'; end if;
  if p_date is null then raise exception '날짜를 입력하세요.'; end if;
  select * into r from public.order_items where id = p_item for update;
  if r.id is null then raise exception '품목을 찾을 수 없습니다.'; end if;
  if r.status = 'CANCELLED' then raise exception '취소된 품목에는 납품을 등록할 수 없습니다.'; end if;
  delivered := public.net_delivered(p_item);
  remain := greatest(0, r.qty - r.cancelled_qty - delivered);
  if p_kind = 'DELIVERY' and p_qty > remain then raise exception '미납수량(%)을 초과할 수 없습니다.', remain; end if;
  if p_kind = 'RETURN' and p_qty > delivered then raise exception '반품수량은 누적 납품수량(%)을 넘을 수 없습니다.', delivered; end if;
  insert into public.deliveries(item_id, kind, date, qty, handler_id, memo, created_by)
  values (p_item, p_kind, p_date, p_qty, me, nullif(p_memo, ''), me) returning id into did;
  perform public.audit(me, 'delivery', did, r.order_id, 'CREATE', null, null,
                       case p_kind when 'DELIVERY' then '납품 ' else '반품 ' end || p_qty || ' (' || p_date || ')');
  perform public.bump_order(r.order_id, me);
  return did;
end $$;

-- 정정: 기존 이력은 그대로 두고 무효(VOID) 행을 추가
create or replace function public.void_delivery(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); t public.deliveries; r public.order_items; net numeric; begin
  if coalesce(trim(p_reason), '') = '' then raise exception '정정 사유를 입력하세요.'; end if;
  select * into t from public.deliveries where id = p_id;
  if t.id is null or t.kind = 'VOID' then raise exception '정정할 이력을 찾을 수 없습니다.'; end if;
  select * into r from public.order_items where id = t.item_id for update;
  if exists (select 1 from public.deliveries where voids_id = p_id) then raise exception '이미 정정된 이력입니다.'; end if;
  net := public.net_delivered(t.item_id) - case t.kind when 'DELIVERY' then t.qty else -t.qty end;
  if net < 0 then raise exception '이 납품을 무효화하면 반품수량이 납품수량보다 많아집니다. 반품 이력을 먼저 정정하세요.'; end if;
  if net > r.qty - r.cancelled_qty then raise exception '이 반품을 무효화하면 납품수량이 발주수량을 넘습니다.'; end if;
  insert into public.deliveries(item_id, kind, date, qty, voids_id, handler_id, memo, created_by)
  values (t.item_id, 'VOID', current_date, t.qty, p_id, me, p_reason, me);
  perform public.audit(me, 'delivery', p_id, r.order_id, 'UPDATE', '정정(무효)', t.kind || ' ' || t.qty, '무효 — ' || p_reason);
  perform public.bump_order(r.order_id, me);
end $$;

create or replace function public.upsert_customer(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); cid uuid; nn text := public.normalize_name(p->>'name'); begin
  if nn = '' then raise exception '거래처명을 입력하세요.'; end if;
  cid := nullif(p->>'id', '')::uuid;
  if cid is not null then
    if exists (select 1 from public.customers where normalized_name = nn and id <> cid) then raise exception '같은 이름의 거래처가 이미 있습니다.'; end if;
    update public.customers set name = trim(p->>'name'), normalized_name = nn, kind = coalesce(p->>'kind', kind),
      contact = nullif(p->>'contact', ''), shipping_method = nullif(p->>'shippingMethod', ''), shipping_branch = nullif(p->>'shippingBranch', ''),
      memo = nullif(p->>'memo', ''), updated_at = now() where id = cid;
  else
    insert into public.customers(name, normalized_name, kind, contact, shipping_method, shipping_branch, memo)
    values (trim(p->>'name'), nn, coalesce(p->>'kind', 'B2B'), nullif(p->>'contact', ''), nullif(p->>'shippingMethod', ''), nullif(p->>'shippingBranch', ''), nullif(p->>'memo', ''))
    on conflict (normalized_name) do update set updated_at = now()
    returning id into cid;
  end if;
  perform public.audit(me, 'customer', cid, null, 'UPDATE', null, null, p->>'name');
  return cid;
end $$;

-- 엑셀 업로드: 전체를 한 트랜잭션으로 (중간 오류 시 전부 취소)
create or replace function public.import_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_writer(); bid uuid; mode text := p->'batch'->>'mode'; u jsonb; oid uuid; iid uuid;
        n_ins int; n_upd int := 0; delivered numeric; r public.order_items; suffix text;
begin
  if mode = 'MIGRATION' then perform public.require_admin(); end if;
  insert into public.import_batches(user_id, file_name, file_hash, mode, sheets, total, skipped, errors)
  values (me, p->'batch'->>'fileName', p->'batch'->>'fileHash', mode,
          array(select jsonb_array_elements_text(coalesce(p->'batch'->'sheets', '[]'))),
          coalesce((p->'batch'->>'total')::int, 0), coalesce((p->'batch'->>'skipped')::int, 0), coalesce((p->'batch'->>'errors')::int, 0))
  returning id into bid;
  suffix := '-' || substr(replace(bid::text, '-', ''), 1, 4);

  -- 거래처: 같은 이름은 비어 있는 칸만 보충
  insert into public.customers(name, normalized_name, kind, contact, shipping_method, shipping_branch, memo)
  select distinct on (public.normalize_name(x.name)) trim(x.name), public.normalize_name(x.name), coalesce(x.kind, 'B2B'), x.contact, x."shippingMethod", x."shippingBranch", x.memo
  from jsonb_to_recordset(coalesce(p->'customers', '[]')) as x(name text, kind text, contact text, "shippingMethod" text, "shippingBranch" text, memo text)
  where public.normalize_name(x.name) <> ''
  on conflict (normalized_name) do update set
    contact = coalesce(public.customers.contact, excluded.contact),
    shipping_method = coalesce(public.customers.shipping_method, excluded.shipping_method),
    shipping_branch = coalesce(public.customers.shipping_branch, excluded.shipping_branch),
    memo = coalesce(public.customers.memo, excluded.memo),
    updated_at = now();

  insert into public.orders(id, order_no, order_date, order_type, customer_id, customer_name, channel, requester, assignee_id, due_date, memo, source, import_batch_id, created_by, updated_by)
  select o.id,
         case when o."presetOrderNo" is null then public.next_order_no('KW', o."orderDate")
              when exists (select 1 from public.orders e where e.order_no = o."presetOrderNo") then o."presetOrderNo" || suffix
              else o."presetOrderNo" end,
         o."orderDate", coalesce(o."orderType", 'GENERAL'),
         (select c.id from public.customers c where c.normalized_name = public.normalize_name(o."customerName")),
         o."customerName", coalesce(o.channel, 'DIRECT'), o.requester, o."assigneeId", o."dueDate", o.memo,
         case mode when 'MIGRATION' then 'EXCEL_MIGRATION' else 'EXCEL_DAILY' end, bid, me, me
  from jsonb_to_recordset(coalesce(p->'orders', '[]')) as o(id uuid, "presetOrderNo" text, "orderDate" date, "orderType" text, "customerName" text,
       channel text, requester text, "assigneeId" uuid, "dueDate" date, memo text);

  insert into public.order_items(id, order_id, line_no, product_code, barcode, product_name, spec, qty, unit, unit_price, price_note, currency, assignee_id, due_date, status, supplier, memo, note, attrs)
  select it.id, (o->>'id')::uuid, it."lineNo", it."productCode", it.barcode, it."productName", it.spec, coalesce(it.qty, 0), it.unit, it."unitPrice", it."priceNote",
         coalesce(it.currency, 'KRW'), it."assigneeId", it."dueDate", coalesce(it.status, 'RECEIVED'), it.supplier, it.memo, it.note, it.attrs
  from jsonb_array_elements(coalesce(p->'orders', '[]')) o,
       jsonb_to_recordset(o->'items') as it(id uuid, "lineNo" int, "productCode" text, barcode text, "productName" text, spec text, qty numeric, unit text,
       "unitPrice" numeric, "priceNote" text, currency text, "assigneeId" uuid, "dueDate" date, status text, supplier text, memo text, note text, attrs jsonb);
  get diagnostics n_ins = row_count;

  insert into public.deliveries(item_id, kind, date, qty, handler_id, memo, created_by)
  select d."itemId", 'DELIVERY', d.date, d.qty, me, '엑셀 발송날짜 기준 자동 등록', me
  from jsonb_to_recordset(coalesce(p->'deliveries', '[]')) as d("itemId" uuid, date date, qty numeric)
  where d.qty > 0;

  -- 기존 품목 갱신 (납품이력은 건드리지 않음)
  for u in select * from jsonb_array_elements(coalesce(p->'updates', '[]')) loop
    select i.id, i.order_id into iid, oid from public.order_items i join public.orders o on o.id = i.order_id
     where o.order_no = u->>'orderNo' and i.line_no = (u->>'lineNo')::int;
    continue when iid is null;
    perform public.apply_patch('order_items', iid, oid, u->'patch',
      array['qty','unit_price','memo','note','due_date','assignee_id','spec'], me);
    select * into r from public.order_items where id = iid;
    delivered := public.net_delivered(iid);
    if r.qty - r.cancelled_qty < delivered then
      raise exception '%-%: 이미 납품된 수량(%)보다 작게 바꿀 수 없습니다', u->>'orderNo', u->>'lineNo', delivered;
    end if;
    perform public.bump_order(oid, me);
    n_upd := n_upd + 1;
  end loop;

  insert into public.legacy_rows(batch_id, sheet, row_no, raw, flags, fingerprint, item_id, issues)
  select bid, l.sheet, l."rowNo", l.raw, l.flags, l.fingerprint, l."itemId", coalesce(array(select jsonb_array_elements_text(l.issues)), '{}')
  from jsonb_to_recordset(coalesce(p->'legacyRows', '[]')) as l(sheet text, "rowNo" int, raw jsonb, flags jsonb, fingerprint text, "itemId" uuid, issues jsonb);

  update public.import_batches set inserted = n_ins, updated = n_upd where id = bid;
  perform public.audit(me, 'import', bid, null, 'IMPORT', null, null,
    (p->'batch'->>'fileName') || ': 신규 ' || n_ins || ', 갱신 ' || n_upd || ', 건너뜀 ' || coalesce(p->'batch'->>'skipped', '0') || ', 오류 ' || coalesce(p->'batch'->>'errors', '0'));
  return (select to_jsonb(b) from public.import_batches b where b.id = bid);
end $$;

-- 관리자: 직원 등록/수정 (여기 등록된 이메일만 가입·로그인 가능)
create or replace function public.admin_upsert_user(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := public.require_admin(); uid uuid := nullif(p->>'id', '')::uuid; em text := lower(trim(p->>'email')); begin
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception '이메일 형식이 올바르지 않습니다.'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception '이름을 입력하세요.'; end if;
  if uid = me and (p->>'role' <> 'ADMIN' or (p->>'active')::boolean = false) then raise exception '자기 자신의 관리자 권한은 해제할 수 없습니다.'; end if;
  if uid is null then
    insert into public.app_users(email, name, aliases, role, active)
    values (em, trim(p->>'name'), coalesce(array(select jsonb_array_elements_text(p->'aliases')), '{}'), p->>'role', coalesce((p->>'active')::boolean, true))
    returning id into uid;
  else
    update public.app_users set email = em, name = trim(p->>'name'),
      aliases = coalesce(array(select jsonb_array_elements_text(p->'aliases')), '{}'), role = p->>'role', active = coalesce((p->>'active')::boolean, true)
    where id = uid;
  end if;
  perform public.audit(me, 'user', uid, null, 'UPDATE', 'app_user', null, em || ' / ' || (p->>'role') || case when (p->>'active')::boolean = false then ' / 비활성' else '' end);
  return uid;
end $$;

-- (테스트 데이터 삭제는 운영 전환 시 관리자 확인 후 별도로 실행합니다: orders.is_test = true 인 행)

-- ───────── 가입 제한: 관리자가 등록한 이메일만 계정 생성 가능 ─────────
create or replace function public.check_signup_allowed() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  if not exists (select 1 from public.app_users where email = lower(new.email) and active and auth_user_id is null) then
    raise exception '등록되지 않은 이메일입니다. 관리자에게 문의하세요.';
  end if;
  return new;
end $$;
create trigger kiwon_check_signup before insert on auth.users for each row execute function public.check_signup_allowed();

create or replace function public.link_app_user() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  update public.app_users set auth_user_id = new.id where email = lower(new.email) and auth_user_id is null;
  return new;
end $$;
create trigger kiwon_link_user after insert on auth.users for each row execute function public.link_app_user();

-- ───────── RLS: 등록된 직원만 읽기, 쓰기는 RPC 로만 ─────────
alter table public.app_users enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.import_batches enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.legacy_rows enable row level security;
alter table public.saved_views enable row level security;
alter table public.order_no_seq enable row level security;

create policy members_read on public.app_users for select to authenticated using (public.my_role() is not null);
create policy members_read on public.customers for select to authenticated using (public.my_role() is not null);
create policy members_read on public.products for select to authenticated using (public.my_role() is not null);
create policy members_read on public.import_batches for select to authenticated using (public.my_role() is not null);
create policy members_read on public.orders for select to authenticated using (public.my_role() is not null);
create policy members_read on public.order_items for select to authenticated using (public.my_role() is not null);
create policy members_read on public.deliveries for select to authenticated using (public.my_role() is not null);
create policy members_read on public.audit_logs for select to authenticated using (public.my_role() is not null);
create policy members_read on public.legacy_rows for select to authenticated using (public.my_role() is not null);
create policy own_views on public.saved_views for all to authenticated
  using (user_id = public.my_app_user_id()) with check (user_id = public.my_app_user_id());

-- 직접 쓰기 권한 회수 (RPC 함수만 사용)
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on public.app_users, public.customers, public.products, public.import_batches, public.orders,
  public.order_items, public.deliveries, public.audit_logs, public.legacy_rows, public.order_no_seq from authenticated;
revoke all on public.order_no_seq from authenticated;

-- 함수 실행 권한: 로그인 사용자만 (anon 불가)
revoke execute on all functions in schema public from public, anon;
grant execute on function public.create_order(jsonb), public.update_order(uuid, int, jsonb), public.update_item(uuid, int, jsonb),
  public.add_delivery(uuid, text, numeric, date, text), public.void_delivery(uuid, text), public.upsert_customer(jsonb),
  public.import_commit(jsonb), public.admin_upsert_user(jsonb), public.my_role(), public.my_app_user_id(),
  public.net_delivered(uuid), public.normalize_name(text)
  to authenticated;
-- 내부용 함수는 직접 호출 불가
revoke execute on function public.apply_patch(text, uuid, uuid, jsonb, text[], uuid), public.audit(uuid, text, uuid, uuid, text, text, text, text),
  public.next_order_no(text, date), public.bump_order(uuid, uuid), public.lock_order_version(uuid, int), public.require_writer(), public.require_admin()
  from authenticated;
-- 가입 트리거 함수는 auth 가 실행
grant execute on function public.check_signup_allowed(), public.link_app_user() to supabase_auth_admin;

-- 실시간 반영
alter publication supabase_realtime add table public.orders, public.order_items, public.deliveries, public.customers, public.app_users, public.import_batches;

-- 보안 점검(advisor) 반영
revoke execute on function public.check_signup_allowed(), public.link_app_user() from authenticated;
alter function public.normalize_name(text) set search_path = public;
create policy no_access on public.order_no_seq for select to authenticated using (false);
