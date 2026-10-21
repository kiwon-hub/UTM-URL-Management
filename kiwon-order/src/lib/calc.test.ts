import { describe, expect, it } from "vitest";
import { buildRow, deriveStatus, lineAmount, netDelivered, nextOrderNo, remainingQty, validateDelivery } from "./calc";
import type { Delivery, Order, OrderItem } from "./types";

const item = (p: Partial<OrderItem> = {}): OrderItem => ({
  id: "i1", orderId: "o1", lineNo: 1, productName: "엔드밀", qty: 100, cancelledQty: 0, unitPrice: 1000, currency: "KRW", status: "CONFIRMED", ...p,
});
const dl = (id: string, kind: Delivery["kind"], qty: number, voidsId?: string): Delivery => ({
  id, itemId: "i1", kind, qty, voidsId, date: "2026-10-01", handlerId: "u1", createdAt: "", createdBy: "u1",
});

describe("부분납품·미납", () => {
  it("요청서 예시: 100개 중 30+40 납품 → 미납 30", () => {
    const ds = [dl("d1", "DELIVERY", 30), dl("d2", "DELIVERY", 40)];
    expect(netDelivered(ds)).toBe(70);
    expect(remainingQty(item(), 70)).toBe(30);
    expect(deriveStatus(item(), 70)).toBe("PARTIAL");
  });
  it("반품은 납품에서 빠지고, 무효 처리된 이력은 집계에서 제외", () => {
    const ds = [dl("d1", "DELIVERY", 30), dl("d2", "DELIVERY", 40), dl("d3", "RETURN", 10), dl("d4", "VOID", 40, "d2")];
    expect(netDelivered(ds)).toBe(20);
  });
  it("초과 납품 차단", () => {
    const ds = [dl("d1", "DELIVERY", 90)];
    expect(validateDelivery(item(), ds, "DELIVERY", 11).ok).toBe(false);
    expect(validateDelivery(item(), ds, "DELIVERY", 10).ok).toBe(true);
    expect(validateDelivery(item(), ds, "RETURN", 91).ok).toBe(false);
    expect(validateDelivery(item(), ds, "DELIVERY", 0).ok).toBe(false);
  });
  it("마감(취소)수량 반영", () => {
    const it2 = item({ cancelledQty: 30 });
    expect(remainingQty(it2, 70)).toBe(0);
    expect(deriveStatus(it2, 70)).toBe("DELIVERED");
  });
  it("취소 품목은 미납 0", () => {
    expect(remainingQty(item({ status: "CANCELLED" }), 0)).toBe(0);
  });
});

describe("금액·지연·번호", () => {
  it("단가 없음 → 금액 없음, 0원 → 0", () => {
    expect(lineAmount(5, null)).toBeNull();
    expect(lineAmount(5, 0)).toBe(0);
    expect(lineAmount(3, 7.1)).toBe(21.3);
  });
  it("납기 지난 미납은 지연", () => {
    const o = { id: "o1", dueDate: "2026-10-01" } as Order;
    expect(buildRow(o, item(), [], "2026-10-02").overdue).toBe(true);
    expect(buildRow(o, item(), [dl("d1", "DELIVERY", 100)], "2026-10-02").overdue).toBe(false);
    expect(buildRow(o, item({ status: "ON_HOLD" }), [], "2026-10-02").overdue).toBe(false);
  });
  it("발주번호 자동생성", () => {
    expect(nextOrderNo("KT", "2026-10-21", [])).toBe("KT-261021-001");
    expect(nextOrderNo("KT", "2026-10-21", ["KT-261021-001", "KT-261021-007", "KM-261021-009"])).toBe("KT-261021-008");
  });
});
