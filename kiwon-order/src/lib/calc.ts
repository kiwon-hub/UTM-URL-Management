import type { Delivery, ItemRow, Order, OrderItem, StatusCode } from "./types";

export const DUE_SOON_DAYS = 3; // 납기 임박 기준 (제안값, 설정에서 변경)

export function todayStr(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

/** 누적 유효 납품수량 = 납품 - 반품, 무효(VOID) 처리된 행은 제외 */
export function netDelivered(deliveries: Delivery[]): number {
  const voided = new Set(deliveries.filter((d) => d.kind === "VOID" && d.voidsId).map((d) => d.voidsId!));
  let sum = 0;
  for (const d of deliveries) {
    if (d.kind === "VOID" || voided.has(d.id)) continue;
    sum += d.kind === "DELIVERY" ? d.qty : -d.qty;
  }
  return sum;
}

/** 미납수량 = 발주수량 - 취소/마감수량 - 누적 유효 납품수량 */
export function remainingQty(item: Pick<OrderItem, "qty" | "cancelledQty" | "status">, delivered: number): number {
  if (item.status === "CANCELLED") return 0;
  return Math.max(0, item.qty - item.cancelledQty - delivered);
}

/** 단가가 비어 있으면 금액도 비어 있음(null). 0원은 0. */
export function lineAmount(qty: number, unitPrice: number | null): number | null {
  if (unitPrice === null || Number.isNaN(unitPrice)) return null;
  return Math.round(qty * unitPrice * 100) / 100;
}

/**
 * 납품 이력이 있으면 부분납품/납품완료는 수량으로 자동 판정 (제안 규칙).
 * 보류·취소는 사람이 지정한 값을 우선합니다.
 */
export function deriveStatus(item: OrderItem, delivered: number): StatusCode {
  if (item.status === "CANCELLED" || item.status === "ON_HOLD") return item.status;
  const target = item.qty - item.cancelledQty;
  if (target <= 0) return item.cancelledQty > 0 ? "CANCELLED" : item.status;
  if (delivered >= target) return "DELIVERED";
  if (delivered > 0) return "PARTIAL";
  if (item.status === "PARTIAL" || item.status === "DELIVERED") return "READY";
  return item.status;
}

export type DeliveryCheck = { ok: true } | { ok: false; message: string };

/** 납품 입력 검증: 0 이하·초과 납품·반품 초과를 막습니다. */
export function validateDelivery(
  item: OrderItem,
  deliveries: Delivery[],
  kind: "DELIVERY" | "RETURN",
  qty: number,
): DeliveryCheck {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, message: "수량은 1 이상이어야 합니다." };
  if (!Number.isInteger(qty * 1000)) return { ok: false, message: "수량 형식이 올바르지 않습니다." };
  if (item.status === "CANCELLED") return { ok: false, message: "취소된 품목에는 납품을 등록할 수 없습니다." };
  const delivered = netDelivered(deliveries);
  if (kind === "DELIVERY") {
    const remain = remainingQty(item, delivered);
    if (qty > remain) return { ok: false, message: `미납수량(${remain})을 초과할 수 없습니다.` };
  } else if (qty > delivered) {
    return { ok: false, message: `반품수량은 누적 납품수량(${delivered})을 넘을 수 없습니다.` };
  }
  return { ok: true };
}

export function buildRow(order: Order, item: OrderItem, deliveries: Delivery[], today = todayStr()): ItemRow {
  const delivered = netDelivered(deliveries);
  const remaining = remainingQty(item, delivered);
  const effectiveStatus = deriveStatus(item, delivered);
  const due = item.dueDate ?? order.dueDate;
  const active = effectiveStatus !== "CANCELLED" && effectiveStatus !== "ON_HOLD" && remaining > 0;
  return {
    order,
    item,
    delivered,
    remaining,
    amount: lineAmount(item.qty, item.unitPrice),
    overdue: !!due && active && due < today,
    dueSoon: !!due && active && due >= today && due <= addDays(today, DUE_SOON_DAYS),
    effectiveStatus,
  };
}

/** 발주번호: {사업부약어}-{YYMMDD}-{일련번호 3자리} (제안 규칙) */
export function nextOrderNo(prefix: string, orderDate: string, existing: string[]): string {
  const ymd = orderDate.replaceAll("-", "").slice(2);
  const head = `${prefix}-${ymd}-`;
  const max = existing
    .filter((n) => n.startsWith(head))
    .map((n) => parseInt(n.slice(head.length), 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return head + String(max + 1).padStart(3, "0");
}
