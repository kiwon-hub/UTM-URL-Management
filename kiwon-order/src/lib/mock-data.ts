// 시안용 가상 데이터. 실제 거래처·고객 정보는 포함하지 않습니다.
import { addDays, nextOrderNo, todayStr } from "./calc";
import { DIVISIONS, ORDER_TYPES } from "./status";
import type { Customer, Delivery, Order, OrderItem, OrderTypeCode, Product, StatusCode, User } from "./types";
import { normalizeName } from "./excel/normalize";

export const USERS: User[] = [
  { id: "u-admin", name: "관리자", aliases: [], role: "ADMIN", divisions: ["TOOLS", "MRO"] },
  { id: "u-mingu", name: "민구", aliases: [], role: "STAFF", divisions: ["TOOLS", "MRO"] },
  { id: "u-iseul", name: "이슬", aliases: [], role: "STAFF", divisions: ["TOOLS"] },
  { id: "u-sora", name: "소라", aliases: [], role: "STAFF", divisions: ["MRO"] },
  { id: "u-jonghyun", name: "종현", aliases: ["신종현과장님", "신종현", "TS"], role: "STAFF", divisions: ["TOOLS"] },
  { id: "u-viewer", name: "조회전용", aliases: [], role: "VIEWER", divisions: [] },
];

const C = (id: string, name: string, kind: Customer["kind"], extra: Partial<Customer> = {}): Customer => ({
  id, name, normalizedName: normalizeName(name), aliases: [], kind, ...extra,
});

export const CUSTOMERS: Customer[] = [
  C("c1", "가람공구", "B2B", { shippingMethod: "로젠택배", contact: "구매담당 010-0000-1111" }),
  C("c2", "대성툴링", "B2B", { shippingMethod: "경동화물", shippingBranch: "경동 화성향남지점" }),
  C("c3", "한빛정밀", "B2B", { shippingMethod: "대신화물", shippingBranch: "대신 구미신평지점", memo: "명세서에 운임비 포함 기재" }),
  C("c4", "세움기공", "B2B", { shippingMethod: "로젠택배" }),
  C("c5", "미래테크", "B2B", { shippingMethod: "경동화물", memo: "월말결제" }),
  C("c6", "동방상사", "B2B"),
  C("c7", "그린안전", "B2B", { shippingMethod: "로젠택배" }),
  C("c8", "홍OO", "ONLINE_PERSON"),
  C("c9", "SAMPLE VINA", "OVERSEAS", { memo: "USD 단가, 통관 후 발송" }),
  C("c10", "기원재고", "INTERNAL", { aliases: ["기원 재고"] }),
  C("c11", "MRO재고", "INTERNAL", { aliases: ["MRO 재고"] }),
];

export const PRODUCTS: Product[] = [
  { code: "KW100229", name: "AL ENDMILL 3F", spec: "Ø2*6L*Ø6*50L*3F", unit: "EA", lastPrice: 7430, currency: "KRW" },
  { code: "KW100239", name: "알루미늄 3날 평 엔드밀", spec: "Ø3*11L*Ø6*55L*3F", unit: "EA", lastPrice: 7800, currency: "KRW" },
  { code: "KW100271", name: "A-cut_Endmill 3F", spec: "Ø6.0*17L*Ø6*60L*3F", unit: "EA", lastPrice: 9800, currency: "KRW" },
  { code: "KW103593", name: "고경도용 4날 코너R 엔드밀", spec: "Ø8*R1.0*20L*Ø8*100L*4F", unit: "EA", lastPrice: 52000, currency: "KRW" },
  { code: "KW106636", name: "2날 센터링 엔드밀 90°", spec: "Ø6*12L*90°*Ø6*60L 2F", unit: "EA", lastPrice: 8100, currency: "KRW" },
  { code: "KW106514", name: "SUS 라핑 엔드밀 3F-5F", spec: "Ø6*R0.2*13L*Ø6*50L", unit: "EA", lastPrice: 13050, currency: "KRW" },
  { code: "KW109353", name: "2날 센터링 엔드밀 90 (코팅)", spec: "Ø8*16L*90°*Ø8*60L 2F", unit: "EA", lastPrice: 10800, currency: "KRW" },
  { code: "KW100545", name: "INSERT", spec: "SDKN1203AESN-SU PC5300", unit: "EA", lastPrice: 5.22, currency: "USD" },
  { code: "KW200010", name: "기원 면장갑 50g", spec: "300켤레(1포대)", unit: "포대", lastPrice: 39083, currency: "KRW" },
  { code: "KW200020", name: "기원 반코팅 장갑 황색 13G", spec: "100켤레", unit: "PK", lastPrice: 14650, currency: "KRW" },
  { code: "KW200030", name: "A급 면보루 기름걸레", spec: "5KG", unit: "봉", lastPrice: 18500, currency: "KRW" },
  { code: "KW200040", name: "방진마스크 2급", spec: "KDR-C200V", unit: "PK", lastPrice: null, currency: "KRW" },
];

// 결정적 난수 (매번 같은 시안 데이터)
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export interface Seed {
  orders: Order[];
  items: OrderItem[];
  deliveries: Delivery[];
}

export function makeSeed(today = todayStr()): Seed {
  const r = rng(20261021);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const orders: Order[] = [];
  const items: OrderItem[] = [];
  const deliveries: Delivery[] = [];
  const staff = USERS.filter((u) => u.role === "STAFF");
  const statuses: StatusCode[] = ["RECEIVED", "CONFIRMED", "IN_PRODUCTION", "IN_PRODUCTION", "READY", "CONFIRMED", "ON_HOLD", "CANCELLED"];
  const memos = ["하루일정으로 제작요청", "재고 보유", "재고없음 — 제작 필요", "중국-납기 2주", "코팅 후 출고", "", "", ""];
  const suppliers = ["", "", "협력사A", "협력사B", "협력사C"];

  for (let n = 0; n < 48; n++) {
    const typeDef = pick(ORDER_TYPES.filter((t) => t.code !== "NTY"));
    const type: OrderTypeCode = typeDef.code;
    const daysAgo = n < 4 ? 0 : Math.floor(r() * 40);
    const orderDate = addDays(today, -daysAgo);
    const cust =
      type === "VIETNAM" ? CUSTOMERS[8] : type === "STOCK" ? CUSTOMERS[9] : type === "MRO_SUPPLY" ? pick([CUSTOMERS[6], CUSTOMERS[7], CUSTOMERS[3]]) : pick(CUSTOMERS.slice(0, 6));
    const assignee = pick(staff.filter((u) => u.divisions.includes(typeDef.division)));
    const prefix = DIVISIONS.find((d) => d.code === typeDef.division)!.short;
    const orderNo = nextOrderNo(prefix, orderDate, orders.map((o) => o.orderNo));
    const due = addDays(orderDate, 5 + Math.floor(r() * 20));
    const source = r() < 0.35 ? "EXCEL_DAILY" : "MANUAL";
    const o: Order = {
      id: `o${n + 1}`,
      orderNo,
      orderDate,
      division: typeDef.division,
      orderType: type,
      customerId: cust.id,
      customerName: cust.name + (cust.kind === "ONLINE_PERSON" ? "(네이버페이)" : ""),
      channel: cust.kind === "ONLINE_PERSON" ? "NAVERPAY" : cust.kind === "INTERNAL" ? "INTERNAL" : "DIRECT",
      requester: type === "VIETNAM" ? "HAI" : undefined,
      assigneeId: assignee.id,
      dueDate: due,
      memo: n % 7 === 0 ? "분할 납품 가능 여부 확인" : undefined,
      source,
      version: 1,
      createdAt: orderDate + "T09:00:00",
      createdBy: assignee.id,
      updatedAt: orderDate + "T09:00:00",
      updatedBy: assignee.id,
    };
    orders.push(o);

    const pool =
      type === "MRO_SUPPLY" ? PRODUCTS.filter((p) => p.code.startsWith("KW2")) : type === "VIETNAM" ? PRODUCTS.filter((p) => p.currency === "USD" || p.code === "KW100271") : PRODUCTS.filter((p) => p.code.startsWith("KW1"));
    const lines = 1 + Math.floor(r() * 4);
    for (let l = 0; l < lines; l++) {
      const p = pick(pool);
      const qty = [5, 10, 20, 30, 50, 100][Math.floor(r() * 6)];
      let status = pick(statuses);
      if (daysAgo === 0) status = "RECEIVED";
      const id = `${o.id}-${l + 1}`;
      const itemAssignee = r() < 0.2 ? pick(staff).id : assignee.id;
      const item: OrderItem = {
        id,
        orderId: o.id,
        lineNo: l + 1,
        productCode: p.code,
        productName: p.name,
        spec: p.spec,
        qty,
        cancelledQty: 0,
        unit: p.unit,
        unitPrice: type === "STOCK" ? null : r() < 0.1 ? 0 : p.lastPrice ?? null,
        priceNote: undefined,
        currency: type === "VIETNAM" ? "USD" : p.currency,
        assigneeId: itemAssignee,
        dueDate: r() < 0.3 ? addDays(due, Math.floor(r() * 6) - 3) : undefined,
        status,
        supplier: pick(suppliers) || undefined,
        memo: pick(memos) || undefined,
        attrs: type === "VIETNAM" ? { 코팅: pick(["TIALN", "", ""]), 헬릭스: pick(["35°", "30°", ""]) } : undefined,
      };
      if (item.unitPrice === 0) item.priceNote = "무상샘플";
      items.push(item);

      // 납품 이력: 오래된 발주일수록 납품이 진행된 경우가 많음
      if (status !== "CANCELLED" && status !== "ON_HOLD" && daysAgo > 3) {
        const roll = r();
        const handler = itemAssignee;
        if (roll < 0.35) {
          deliveries.push(mk(`${id}-d1`, id, "DELIVERY", qty, addDays(orderDate, 3), handler));
        } else if (roll < 0.65) {
          const first = Math.max(1, Math.floor(qty * (0.2 + r() * 0.5)));
          deliveries.push(mk(`${id}-d1`, id, "DELIVERY", first, addDays(orderDate, 2), handler));
          if (r() < 0.5 && qty - first > 1) {
            const second = Math.floor((qty - first) / 2);
            deliveries.push(mk(`${id}-d2`, id, "DELIVERY", second, addDays(orderDate, 6), handler, "2차 납품"));
          }
        }
      }
    }
  }
  // 반품·정정 예시
  const ex = deliveries.find((d) => d.qty >= 10);
  if (ex) {
    deliveries.push(mk(`${ex.id}-ret`, ex.itemId, "RETURN", 2, addDays(ex.date, 4), ex.handlerId, "불량 2개 반품"));
  }
  return { orders, items, deliveries };
}

function mk(id: string, itemId: string, kind: Delivery["kind"], qty: number, date: string, handlerId: string, memo?: string): Delivery {
  return { id, itemId, kind, qty, date, handlerId, memo, createdAt: date + "T15:00:00", createdBy: handlerId };
}
