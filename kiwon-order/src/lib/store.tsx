"use client";
// 공용 데이터 저장소: Supabase(PostgreSQL)에서 읽고, 쓰기는 서버 함수(RPC)로만 합니다.
// 다른 직원이 바꾼 내용은 실시간(Realtime)으로 이 화면에도 반영됩니다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { buildRow, todayStr } from "./calc";
import type { ImportPayload } from "./excel/commit";
import { errMsg, fetchAll, fromRow, sb, toPatch } from "./supabase";
import type { AuditLog, Customer, Delivery, ImportBatch, ItemRow, LegacyRow, Order, OrderItem, Product, SavedView, StatusCode, User } from "./types";

export interface DB {
  users: User[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  items: OrderItem[];
  deliveries: Delivery[];
  imports: ImportBatch[];
  savedViews: SavedView[];
}
const EMPTY: DB = { users: [], customers: [], products: [], orders: [], items: [], deliveries: [], imports: [], savedViews: [] };

export interface NewOrderInput {
  orderDate: string;
  orderType?: string;
  customerId?: string | null;
  customerName: string;
  channel: string;
  requester?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  memo?: string | null;
  isTest?: boolean;
  items: Partial<OrderItem>[];
}

export type SaveResult = { ok: true } | { ok: false; conflict: true; current: Order } | { ok: false; conflict?: false; message: string };
export type Action = "view" | "create" | "edit" | "delete" | "admin";

interface Ctx {
  db: DB;
  me: User;
  rows: ItemRow[];
  live: boolean; // 실시간 연결 상태
  can: (action: Action) => boolean;
  reload: () => Promise<void>;
  createOrder: (input: NewOrderInput) => Promise<{ id: string; orderNo: string } | { error: string }>;
  updateOrder: (orderId: string, patch: Partial<Order>, expectedVersion: number) => Promise<SaveResult>;
  updateItem: (itemId: string, patch: Partial<OrderItem>, expectedVersion: number) => Promise<SaveResult>;
  addDelivery: (itemId: string, kind: "DELIVERY" | "RETURN", qty: number, date: string, memo?: string) => Promise<SaveResult>;
  voidDelivery: (deliveryId: string, reason: string) => Promise<SaveResult>;
  commitImport: (p: ImportPayload) => Promise<ImportBatch | { error: string }>;
  saveView: (v: Omit<SavedView, "id" | "userId">) => Promise<void>;
  deleteView: (id: string) => Promise<void>;
  upsertCustomer: (c: Partial<Customer> & { name: string }) => Promise<{ id: string } | { error: string }>;
  adminUpsertUser: (u: Partial<User> & { email: string; name: string; role: User["role"] }) => Promise<{ ok: true } | { error: string }>;
  fetchAudits: (orderId?: string, limit?: number) => Promise<AuditLog[]>;
  fetchLegacy: (itemId: string) => Promise<LegacyRow | null>;
  fetchFingerprints: () => Promise<Set<string>>;
  signOut: () => Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);

type Table = "orders" | "order_items" | "deliveries" | "customers" | "app_users" | "import_batches";
const KEY_OF: Record<Table, keyof DB> = { orders: "orders", order_items: "items", deliveries: "deliveries", customers: "customers", app_users: "users", import_batches: "imports" };

function upsertById<T extends { id: string }>(list: T[], rows: T[]): T[] {
  if (!rows.length) return list;
  const m = new Map(list.map((x) => [x.id, x]));
  for (const r of rows) m.set(r.id, r);
  return [...m.values()];
}

export function DataProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [db, setDb] = useState<DB>(EMPTY);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [live, setLive] = useState(false);
  const pending = useRef<{ t: Table; type: string; row: Record<string, unknown> }[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const [users, customers, products, orders, items, deliveries, imports, savedViews] = await Promise.all([
        fetchAll<User>("app_users"),
        fetchAll<Customer>("customers"),
        fetchAll<Product>("products", { order: "code" }),
        fetchAll<Order>("orders"),
        fetchAll<OrderItem>("order_items"),
        fetchAll<Delivery>("deliveries"),
        fetchAll<ImportBatch>("import_batches"),
        fetchAll<SavedView>("saved_views"),
      ]);
      setDb({ users, customers, products, orders, items, deliveries, imports: imports.sort((a, b) => b.at.localeCompare(a.at)), savedViews });
      setState("ready");
    } catch (e) {
      setLoadError(errMsg(e));
      setState("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, session.user.id]);

  // 실시간: 변경 이벤트를 0.3초씩 모아서 반영 (엑셀 대량 업로드 때 화면이 멈추지 않게)
  useEffect(() => {
    const flush = () => {
      flushTimer.current = null;
      const evs = pending.current.splice(0);
      if (evs.length > 500) {
        reload();
        return;
      }
      setDb((d) => {
        const next = { ...d };
        for (const t of Object.keys(KEY_OF) as Table[]) {
          const mine = evs.filter((e) => e.t === t);
          if (!mine.length) continue;
          const key = KEY_OF[t];
          const del = new Set(mine.filter((e) => e.type === "DELETE").map((e) => String(e.row.id)));
          const ups = mine.filter((e) => e.type !== "DELETE").map((e) => fromRow<{ id: string }>(e.row));
          let list = upsertById(d[key] as unknown as { id: string }[], ups);
          if (del.size) list = list.filter((x) => !del.has(x.id));
          (next as unknown as Record<string, unknown>)[key] = list;
        }
        return next;
      });
    };
    let ch = sb.channel("kiwon-db");
    for (const t of Object.keys(KEY_OF) as Table[]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as Record<string, unknown>;
        pending.current.push({ t, type: payload.eventType, row });
        if (!flushTimer.current) flushTimer.current = setTimeout(flush, 300);
      });
    }
    let first = true;
    ch.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      // 연결이 끊겼다가 다시 붙으면 놓친 변경이 있을 수 있어 전체 다시 읽기
      if (status === "SUBSCRIBED" && !first) reload();
      if (status === "SUBSCRIBED") first = false;
    });
    return () => {
      sb.removeChannel(ch);
    };
  }, [reload]);

  /** 방금 바꾼 발주만 즉시 다시 읽기 (실시간 이벤트보다 먼저 화면에 반영) */
  const refreshOrder = useCallback(async (orderId: string) => {
    const [o, it] = await Promise.all([sb.from("orders").select("*").eq("id", orderId), sb.from("order_items").select("*").eq("order_id", orderId)]);
    const items = (it.data ?? []).map((r) => fromRow<OrderItem>(r));
    const ds = items.length ? await sb.from("deliveries").select("*").in("item_id", items.map((i) => i.id)) : { data: [] };
    setDb((d) => ({
      ...d,
      orders: upsertById(d.orders, (o.data ?? []).map((r) => fromRow<Order>(r))),
      items: upsertById(d.items, items),
      deliveries: upsertById(d.deliveries, (ds.data ?? []).map((r) => fromRow<Delivery>(r))),
    }));
  }, []);

  const me = db.users.find((u) => u.authUserId === session.user.id && u.active);

  const can = useCallback(
    (action: Action) => {
      if (!me) return false;
      if (me.role === "ADMIN") return true;
      if (me.role === "VIEWER") return action === "view";
      return action === "view" || action === "create" || action === "edit";
    },
    [me],
  );

  const rows = useMemo(() => {
    const byItem = new Map<string, Delivery[]>();
    for (const d of db.deliveries) {
      const a = byItem.get(d.itemId);
      if (a) a.push(d);
      else byItem.set(d.itemId, [d]);
    }
    const orders = new Map(db.orders.map((o) => [o.id, o]));
    const today = todayStr();
    return db.items.filter((i) => orders.has(i.orderId)).map((i) => buildRow(orders.get(i.orderId)!, i, byItem.get(i.id) ?? [], today));
  }, [db.items, db.orders, db.deliveries]);

  if (state === "loading") return <Center>데이터를 불러오는 중…</Center>;
  if (state === "error")
    return (
      <Center>
        <p className="text-red-700">⚠ 데이터를 불러오지 못했습니다: {loadError}</p>
        <button className="btn mt-3" onClick={() => { setState("loading"); reload(); }}>다시 시도</button>
      </Center>
    );
  if (!me)
    return (
      <Center>
        <p className="font-semibold">접근 권한이 없는 계정입니다.</p>
        <p className="mt-1 text-slate-600">{session.user.email} — 관리자에게 직원 등록을 요청하세요.</p>
        <button className="btn mt-3" onClick={() => sb.auth.signOut()}>로그아웃</button>
      </Center>
    );

  const asResult = async (orderId: string | undefined, run: () => PromiseLike<{ error: { code?: string; message: string } | null }>): Promise<SaveResult> => {
    const { error } = await run();
    if (error) {
      if (error.code === "P0409" || error.message === "CONFLICT") {
        const { data } = await sb.from("orders").select("*").eq("id", orderId ?? "").single();
        if (orderId) await refreshOrder(orderId);
        return { ok: false, conflict: true, current: fromRow<Order>((data ?? {}) as Record<string, unknown>) };
      }
      return { ok: false, message: errMsg(error) };
    }
    if (orderId) await refreshOrder(orderId);
    return { ok: true };
  };
  const orderOfItem = (itemId: string) => db.items.find((i) => i.id === itemId)?.orderId;

  const value: Ctx = {
    db,
    me,
    rows,
    live,
    can,
    reload,
    createOrder: async (input) => {
      const { data, error } = await sb.rpc("create_order", { p: input });
      if (error) return { error: errMsg(error) };
      const r = data as { id: string; orderNo: string };
      await refreshOrder(r.id);
      return r;
    },
    updateOrder: (orderId, patch, v) => asResult(orderId, () => sb.rpc("update_order", { p_id: orderId, p_version: v, p_patch: toPatch(patch as Record<string, unknown>) })),
    updateItem: (itemId, patch, v) => asResult(orderOfItem(itemId), () => sb.rpc("update_item", { p_id: itemId, p_version: v, p_patch: toPatch(patch as Record<string, unknown>) })),
    addDelivery: (itemId, kind, qty, date, memo) =>
      asResult(orderOfItem(itemId), () => sb.rpc("add_delivery", { p_item: itemId, p_kind: kind, p_qty: qty, p_date: date, p_memo: memo ?? null })),
    voidDelivery: (deliveryId, reason) => {
      const itemId = db.deliveries.find((d) => d.id === deliveryId)?.itemId ?? "";
      return asResult(orderOfItem(itemId), () => sb.rpc("void_delivery", { p_id: deliveryId, p_reason: reason }));
    },
    commitImport: async (p) => {
      const { data, error } = await sb.rpc("import_commit", { p });
      if (error) return { error: `저장 중 오류가 발생해 아무것도 저장하지 않았습니다: ${errMsg(error)}` };
      await reload();
      return fromRow<ImportBatch>(data as Record<string, unknown>);
    },
    saveView: async (v) => {
      const { error } = await sb.from("saved_views").insert({ user_id: me.id, name: v.name, filters: v.filters, columns: v.columns, page_size: v.pageSize, sort: v.sort ?? null });
      if (!error) {
        const savedViews = await fetchAll<SavedView>("saved_views");
        setDb((d) => ({ ...d, savedViews }));
      }
    },
    deleteView: async (id) => {
      await sb.from("saved_views").delete().eq("id", id);
      setDb((d) => ({ ...d, savedViews: d.savedViews.filter((x) => x.id !== id) }));
    },
    upsertCustomer: async (c) => {
      const { data, error } = await sb.rpc("upsert_customer", { p: c });
      if (error) return { error: errMsg(error) };
      const customers = await fetchAll<Customer>("customers");
      setDb((d) => ({ ...d, customers }));
      return { id: data as string };
    },
    adminUpsertUser: async (u) => {
      const { error } = await sb.rpc("admin_upsert_user", { p: u });
      if (error) return { error: errMsg(error) };
      const users = await fetchAll<User>("app_users");
      setDb((d) => ({ ...d, users }));
      return { ok: true };
    },
    fetchAudits: async (orderId, limit = 300) => {
      let q = sb.from("audit_logs").select("*").order("at", { ascending: false }).limit(limit);
      if (orderId) q = q.eq("order_id", orderId);
      const { data } = await q;
      return (data ?? []).map((r) => fromRow<AuditLog>(r));
    },
    fetchLegacy: async (itemId) => {
      const { data } = await sb.from("legacy_rows").select("*").eq("item_id", itemId).limit(1);
      return data?.[0] ? fromRow<LegacyRow>(data[0]) : null;
    },
    fetchFingerprints: async () => {
      const list = await fetchAll<{ fingerprint: string }>("legacy_rows", { select: "id,fingerprint", filter: (q) => q.not("item_id", "is", null) });
      return new Set(list.map((r) => r.fingerprint));
    },
    signOut: async () => {
      await sb.auth.signOut();
    },
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">{children}</div>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("DataProvider 필요");
  return c;
}

export const userName = (db: DB, id?: string | null) => (id ? db.users.find((u) => u.id === id)?.name ?? "" : "");
export const isOpen = (s: StatusCode) => !["DELIVERED", "CANCELLED", "ON_HOLD"].includes(s);
