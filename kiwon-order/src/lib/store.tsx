"use client";
// 1단계 시안용 데이터 저장소 (브라우저 localStorage).
// 함수 이름과 규칙(권한 검사, 감사 로그, 버전 충돌, 납품 검증)은 2단계에서 서버 API 로 그대로 옮깁니다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildRow, nextOrderNo, todayStr, validateDelivery } from "./calc";
import { CUSTOMERS, PRODUCTS, USERS, makeSeed } from "./mock-data";
import { DIVISIONS } from "./status";
import { normalizeName } from "./excel/normalize";
import type {
  AuditLog,
  Customer,
  Delivery,
  DivisionCode,
  ImportBatch,
  ItemRow,
  LegacyRow,
  Order,
  OrderItem,
  Product,
  SavedView,
  StatusCode,
  User,
} from "./types";

const KEY = "kiwon-order-proto-v1";

export interface DB {
  users: User[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  items: OrderItem[];
  deliveries: Delivery[];
  audits: AuditLog[];
  imports: ImportBatch[];
  legacyRows: LegacyRow[];
  savedViews: SavedView[];
  importedHashes: string[];
}

function freshDB(): DB {
  const s = makeSeed();
  return {
    users: USERS,
    customers: CUSTOMERS,
    products: PRODUCTS,
    ...s,
    audits: [],
    imports: [],
    legacyRows: [],
    savedViews: [],
    importedHashes: [],
  };
}

export type NewOrderInput = Omit<Order, "id" | "orderNo" | "version" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy"> & {
  items: Omit<OrderItem, "id" | "orderId" | "lineNo">[];
  presetOrderNo?: string; // 최초 이관용 고정 번호 (L-시트-행번호)
};

export type SaveResult = { ok: true } | { ok: false; conflict: true; current: Order } | { ok: false; conflict?: false; message: string };

export type Action = "view" | "create" | "edit" | "delete" | "admin";

export interface ImportCommit {
  batch: Omit<ImportBatch, "id" | "at" | "userId">;
  orders: NewOrderInput[];
  rowLinks: { legacy: Omit<LegacyRow, "id" | "batchId" | "itemId">; orderIdx: number | null; itemIdx: number | null }[];
  deliveries: { orderIdx: number; itemIdx: number; date: string; qty: number }[];
  updates: { orderNo: string; lineNo: number; patch: Partial<OrderItem> }[];
  customers: Omit<Customer, "id" | "normalizedName">[];
}

interface Ctx {
  ready: boolean;
  db: DB;
  me: User;
  setMe: (id: string) => void;
  rows: ItemRow[];
  can: (action: Action, division?: DivisionCode) => boolean;
  createOrder: (input: NewOrderInput) => Order | { error: string };
  updateOrder: (orderId: string, patch: Partial<Order>, expectedVersion: number) => SaveResult;
  updateItem: (itemId: string, patch: Partial<OrderItem>, expectedVersion: number) => SaveResult;
  addDelivery: (itemId: string, kind: "DELIVERY" | "RETURN", qty: number, date: string, memo?: string) => SaveResult;
  voidDelivery: (deliveryId: string, reason: string) => SaveResult;
  simulateOtherEdit: (orderId: string) => void;
  commitImport: (c: ImportCommit) => ImportBatch | { error: string };
  saveView: (v: Omit<SavedView, "id" | "userId"> & { id?: string }) => void;
  deleteView: (id: string) => void;
  upsertCustomer: (c: Omit<Customer, "id" | "normalizedName"> & { id?: string }) => Customer;
  reset: () => void;
  nowStamp: () => string;
}

const DataCtx = createContext<Ctx | null>(null);

const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const stamp = () => new Date().toISOString().slice(0, 19);

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => freshDB());
  const [meId, setMeId] = useState("u-mingu");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setDb(JSON.parse(raw) as DB);
      const m = localStorage.getItem(KEY + ":me");
      if (m) setMeId(m);
    } catch {
      /* 저장소 사용 불가 — 기본 시안 데이터 사용 */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* 용량 초과 등 — 시안이므로 무시 */
    }
  }, [db, ready]);

  const me = db.users.find((u) => u.id === meId) ?? db.users[0];

  const can = useCallback(
    (action: Action, division?: DivisionCode) => {
      if (me.role === "ADMIN") return true;
      if (me.role === "VIEWER") return action === "view";
      if (action === "view") return true;
      if (action === "admin" || action === "delete") return false;
      return division ? me.divisions.includes(division) : me.divisions.length > 0;
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
    return db.items
      .filter((i) => orders.has(i.orderId))
      .map((i) => buildRow(orders.get(i.orderId)!, i, byItem.get(i.id) ?? [], today));
  }, [db.items, db.orders, db.deliveries]);

  /** 변경 전/후를 필드 단위로 감사 로그에 남김 */
  const diffLogs = (entity: AuditLog["entity"], id: string, orderId: string, before: object, patch: object): AuditLog[] => {
    const at = stamp();
    return Object.entries(patch)
      .filter(([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v))
      .map(([k, v]) => ({
        id: uid("a"),
        at,
        userId: me.id,
        entity,
        entityId: id,
        orderId,
        action: k === "status" ? "STATUS" : "UPDATE",
        field: k,
        before: fmt((before as Record<string, unknown>)[k]),
        after: fmt(v),
      }));
  };

  const createOrder: Ctx["createOrder"] = (input) => {
    if (!can("create", input.division)) return { error: "이 사업부의 발주를 등록할 권한이 없습니다." };
    if (!input.customerName.trim()) return { error: "거래처를 입력하세요." };
    const lines = input.items.filter((i) => i.productName.trim());
    if (!lines.length) return { error: "품목을 1개 이상 입력하세요." };
    for (const [n, i] of lines.entries()) {
      if (!(i.qty > 0)) return { error: `${n + 1}번째 품목의 수량을 확인하세요.` };
      if (i.unitPrice !== null && (Number.isNaN(i.unitPrice) || i.unitPrice < 0)) return { error: `${n + 1}번째 품목의 단가를 확인하세요.` };
    }
    const prefix = DIVISIONS.find((x) => x.code === input.division)!.short;
    const t = stamp();
    const { items: _drop, ...rest } = input;
    void _drop;
    const order: Order = {
      ...rest,
      id: uid("o"),
      orderNo: nextOrderNo(prefix, input.orderDate, db.orders.map((o) => o.orderNo)),
      version: 1,
      createdAt: t,
      createdBy: me.id,
      updatedAt: t,
      updatedBy: me.id,
    };
    const items: OrderItem[] = lines.map((i, n) => ({ ...i, id: uid("i"), orderId: order.id, lineNo: n + 1 }));
    // 서버에서는 발주번호 채번을 트랜잭션 안에서 처리 (03_DB설계.md 참고)
    setDb((d) => ({
      ...d,
      orders: [order, ...d.orders],
      items: [...items, ...d.items],
      audits: [{ id: uid("a"), at: t, userId: me.id, entity: "order", entityId: order.id, orderId: order.id, action: "CREATE", after: `${order.orderNo} (${items.length}품목)` }, ...d.audits],
    }));
    return order;
  };

  const checkVersion = (orderId: string, expected: number): SaveResult | null => {
    const cur = db.orders.find((o) => o.id === orderId);
    if (!cur) return { ok: false, message: "발주를 찾을 수 없습니다." };
    if (!can("edit", cur.division)) return { ok: false, message: "수정 권한이 없습니다." };
    if (cur.version !== expected) return { ok: false, conflict: true, current: cur };
    return null;
  };

  const bump = (d: DB, orderId: string): Order[] =>
    d.orders.map((o) => (o.id === orderId ? { ...o, version: o.version + 1, updatedAt: stamp(), updatedBy: me.id } : o));

  const updateOrder: Ctx["updateOrder"] = (orderId, patch, expectedVersion) => {
    const bad = checkVersion(orderId, expectedVersion);
    if (bad) return bad;
    setDb((d) => {
      const before = d.orders.find((o) => o.id === orderId)!;
      return {
        ...d,
        orders: bump(d, orderId).map((o) => (o.id === orderId ? { ...o, ...patch } : o)),
        audits: [...diffLogs("order", orderId, orderId, before, patch), ...d.audits],
      };
    });
    return { ok: true };
  };

  const updateItem: Ctx["updateItem"] = (itemId, patch, expectedVersion) => {
    const item = db.items.find((i) => i.id === itemId);
    if (!item) return { ok: false, message: "품목을 찾을 수 없습니다." };
    const bad = checkVersion(item.orderId, expectedVersion);
    if (bad) return bad;
    if (patch.qty !== undefined || patch.cancelledQty !== undefined) {
      const delivered = rows.find((r) => r.item.id === itemId)?.delivered ?? 0;
      const qty = patch.qty ?? item.qty;
      const cancelled = patch.cancelledQty ?? item.cancelledQty;
      if (!(qty > 0)) return { ok: false, message: "발주수량은 0보다 커야 합니다." };
      if (cancelled < 0 || cancelled > qty) return { ok: false, message: "마감(취소)수량이 올바르지 않습니다." };
      if (qty - cancelled < delivered) return { ok: false, message: `이미 ${delivered}개 납품되어 그보다 줄일 수 없습니다. 반품을 먼저 등록하세요.` };
    }
    setDb((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      orders: bump(d, item.orderId),
      audits: [...diffLogs("item", itemId, item.orderId, item, patch), ...d.audits],
    }));
    return { ok: true };
  };

  const addDelivery: Ctx["addDelivery"] = (itemId, kind, qty, date, memo) => {
    const item = db.items.find((i) => i.id === itemId);
    if (!item) return { ok: false, message: "품목을 찾을 수 없습니다." };
    const order = db.orders.find((o) => o.id === item.orderId)!;
    if (!can("edit", order.division)) return { ok: false, message: "납품 등록 권한이 없습니다." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "납품일을 확인하세요." };
    const check = validateDelivery(item, db.deliveries.filter((x) => x.itemId === itemId), kind, qty);
    if (!check.ok) return { ok: false, message: check.message };
    const dl: Delivery = { id: uid("d"), itemId, kind, qty, date, memo, handlerId: me.id, createdAt: stamp(), createdBy: me.id };
    setDb((d) => ({
      ...d,
      deliveries: [...d.deliveries, dl],
      orders: bump(d, order.id),
      audits: [
        { id: uid("a"), at: stamp(), userId: me.id, entity: "delivery", entityId: dl.id, orderId: order.id, action: "CREATE", after: `${kind === "DELIVERY" ? "납품" : "반품"} ${qty} (${date})` },
        ...d.audits,
      ],
    }));
    return { ok: true };
  };

  const voidDelivery: Ctx["voidDelivery"] = (deliveryId, reason) => {
    const target = db.deliveries.find((x) => x.id === deliveryId);
    if (!target || target.kind === "VOID") return { ok: false, message: "정정할 이력을 찾을 수 없습니다." };
    if (db.deliveries.some((x) => x.kind === "VOID" && x.voidsId === deliveryId)) return { ok: false, message: "이미 정정된 이력입니다." };
    if (!reason.trim()) return { ok: false, message: "정정 사유를 입력하세요." };
    const item = db.items.find((i) => i.id === target.itemId)!;
    const order = db.orders.find((o) => o.id === item.orderId)!;
    if (!can("edit", order.division)) return { ok: false, message: "권한이 없습니다." };
    // 납품을 무효화하면 '반품'보다 납품이 적어지는지 확인
    if (target.kind === "DELIVERY") {
      const rest = db.deliveries.filter((x) => x.itemId === item.id && x.id !== deliveryId);
      const net = rest.reduce((s, x) => s + (x.kind === "DELIVERY" ? x.qty : x.kind === "RETURN" ? -x.qty : 0), 0);
      if (net < 0) return { ok: false, message: "이 납품을 무효화하면 반품수량이 납품수량보다 많아집니다. 반품 이력을 먼저 정정하세요." };
    }
    const v: Delivery = { id: uid("d"), itemId: item.id, kind: "VOID", qty: target.qty, voidsId: deliveryId, date: todayStr(), memo: reason, handlerId: me.id, createdAt: stamp(), createdBy: me.id };
    setDb((d) => ({
      ...d,
      deliveries: [...d.deliveries, v],
      orders: bump(d, order.id),
      audits: [{ id: uid("a"), at: stamp(), userId: me.id, entity: "delivery", entityId: deliveryId, orderId: order.id, action: "UPDATE", field: "정정(무효)", before: `${target.kind} ${target.qty}`, after: `무효 — ${reason}` }, ...d.audits],
    }));
    return { ok: true };
  };

  /** 시안 시연용: 다른 직원이 같은 발주를 먼저 수정한 상황을 만듦 */
  const simulateOtherEdit = (orderId: string) => {
    setDb((d) => ({
      ...d,
      orders: d.orders.map((o) => (o.id === orderId ? { ...o, version: o.version + 1, memo: (o.memo ? o.memo + " / " : "") + "다른 직원 수정", updatedAt: stamp(), updatedBy: "u-iseul" } : o)),
      audits: [{ id: uid("a"), at: stamp(), userId: "u-iseul", entity: "order", entityId: orderId, orderId, action: "UPDATE", field: "memo", before: "", after: "다른 직원 수정 (시연)" }, ...d.audits],
    }));
  };

  /** 엑셀 업로드 저장. 전부 성공하거나 전부 취소 (시안: 상태를 한 번에 교체) */
  const commitImport: Ctx["commitImport"] = (c) => {
    if (!can("create")) return { error: "업로드 권한이 없습니다." };
    try {
      const batchId = uid("b");
      const t = stamp();
      const next: DB = structuredClone(db);
      // 거래처 시트: 같은 이름(정규화 기준)이 있으면 비어 있는 칸만 채우고, 없으면 새로 등록
      for (const cu of c.customers) {
        const n = normalizeName(cu.name);
        const ex = next.customers.find((x) => x.normalizedName === n || x.aliases.some((a) => normalizeName(a) === n));
        if (ex) {
          for (const k of ["contact", "shippingMethod", "shippingBranch", "memo"] as const) if (!ex[k] && cu[k]) ex[k] = cu[k];
        } else next.customers.push({ ...cu, id: uid("c"), normalizedName: n });
      }
      const custByName = new Map(next.customers.flatMap((x) => [[x.normalizedName, x.id] as const, ...x.aliases.map((a) => [normalizeName(a), x.id] as const)]));
      const orderIds: string[] = [];
      const itemIds: string[][] = [];
      const usedNos = new Set(next.orders.map((o) => o.orderNo));
      for (const [oi, input] of c.orders.entries()) {
        const prefix = DIVISIONS.find((x) => x.code === input.division)!.short;
        const { items, presetOrderNo, ...rest } = input;
        let orderNo = presetOrderNo ?? nextOrderNo(prefix, input.orderDate, [...usedNos]);
        // 같은 파일을 다시 이관할 때 번호가 겹치면 차수를 붙임 (예: L-TOOLS-000318-2)
        for (let n = 2; usedNos.has(orderNo); n++) orderNo = `${presetOrderNo}-${n}`;
        usedNos.add(orderNo);
        const order: Order = { ...rest, customerId: rest.customerId ?? custByName.get(normalizeName(rest.customerName)), id: uid("o"), orderNo, importBatchId: batchId, version: 1, createdAt: t, createdBy: me.id, updatedAt: t, updatedBy: me.id };
        next.orders.unshift(order);
        orderIds[oi] = order.id;
        itemIds[oi] = [];
        items.forEach((it, n) => {
          const item: OrderItem = { ...it, id: uid("i"), orderId: order.id, lineNo: n + 1 };
          next.items.unshift(item);
          itemIds[oi][n] = item.id;
        });
      }
      for (const dl of c.deliveries) {
        const itemId = itemIds[dl.orderIdx]?.[dl.itemIdx];
        if (!itemId) throw new Error("납품 연결 오류");
        next.deliveries.push({ id: uid("d"), itemId, kind: "DELIVERY", qty: dl.qty, date: dl.date, memo: "엑셀 발송날짜 기준 자동 등록", handlerId: me.id, createdAt: t, createdBy: me.id });
      }
      let updated = 0;
      for (const u of c.updates) {
        const order = next.orders.find((o) => o.orderNo === u.orderNo);
        const item = order && next.items.find((i) => i.orderId === order.id && i.lineNo === u.lineNo);
        if (!order || !item) continue;
        const delivered = next.deliveries.filter((x) => x.itemId === item.id).reduce((s, x) => s + (x.kind === "DELIVERY" ? x.qty : x.kind === "RETURN" ? -x.qty : 0), 0);
        if (u.patch.qty !== undefined && u.patch.qty < delivered) throw new Error(`${u.orderNo}-${u.lineNo}: 이미 납품된 수량(${delivered})보다 작게 바꿀 수 없습니다`);
        next.audits.unshift(...diffLogs("item", item.id, order.id, item, u.patch));
        Object.assign(item, u.patch); // 납품 이력은 건드리지 않음
        order.version += 1;
        updated++;
      }
      for (const l of c.rowLinks) {
        next.legacyRows.push({
          ...l.legacy,
          id: uid("r"),
          batchId,
          itemId: l.orderIdx !== null && l.itemIdx !== null ? itemIds[l.orderIdx][l.itemIdx] : undefined,
        });
      }
      const batch: ImportBatch = { ...c.batch, updated, id: batchId, at: t, userId: me.id };
      next.imports.unshift(batch);
      next.importedHashes.push(c.batch.fileHash);
      next.audits.unshift({ id: uid("a"), at: t, userId: me.id, entity: "order", entityId: batchId, action: "IMPORT", after: `${c.batch.fileName}: 신규 ${batch.inserted}, 갱신 ${updated}, 건너뜀 ${batch.skipped}, 오류 ${batch.errors}` });
      setDb(next);
      return batch;
    } catch (e) {
      return { error: `저장 중 오류가 발생해 아무것도 저장하지 않았습니다: ${(e as Error).message}` };
    }
  };

  const saveView: Ctx["saveView"] = (v) =>
    setDb((d) => {
      const id = v.id ?? uid("v");
      const others = d.savedViews.filter((x) => x.id !== id);
      return { ...d, savedViews: [...others, { ...v, id, userId: me.id }] };
    });
  const deleteView: Ctx["deleteView"] = (id) => setDb((d) => ({ ...d, savedViews: d.savedViews.filter((v) => v.id !== id || v.userId !== me.id) }));

  const upsertCustomer: Ctx["upsertCustomer"] = (c) => {
    const normalizedName = normalizeName(c.name);
    const existing = db.customers.find((x) => x.id === c.id || x.normalizedName === normalizedName);
    const saved: Customer = { ...(existing ?? {}), ...c, id: existing?.id ?? uid("c"), normalizedName } as Customer;
    setDb((d) => ({ ...d, customers: existing ? d.customers.map((x) => (x.id === saved.id ? saved : x)) : [...d.customers, saved] }));
    return saved;
  };

  const value: Ctx = {
    ready,
    db,
    me,
    setMe: (id) => {
      setMeId(id);
      try {
        localStorage.setItem(KEY + ":me", id);
      } catch {}
    },
    rows,
    can,
    createOrder,
    updateOrder,
    updateItem,
    addDelivery,
    voidDelivery,
    simulateOtherEdit,
    commitImport,
    saveView,
    deleteView,
    upsertCustomer,
    reset: () => setDb(freshDB()),
    nowStamp: stamp,
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("DataProvider 필요");
  return c;
}

function fmt(v: unknown): string {
  if (v === null) return "(비어있음)";
  if (v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const userName = (db: DB, id?: string) => (id ? db.users.find((u) => u.id === id)?.name ?? id : "");
export const isOpen = (s: StatusCode) => !["DELIVERED", "CANCELLED", "ON_HOLD"].includes(s);
