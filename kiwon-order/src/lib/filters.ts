import { todayStr } from "./calc";
import type { ItemRow, StatusCode } from "./types";

/** 목록·대시보드 공통 필터 (URL 쿼리 문자열과 1:1) */
export interface Filters {
  from?: string; // 발주일 시작
  to?: string; // 발주일 끝
  q?: string; // 통합검색: 업체·상품명·규격·품번·바코드·발주번호
  customer?: string;
  product?: string;
  spec?: string;
  code?: string; // 품번/바코드
  division?: string;
  orderType?: string;
  assignee?: string; // 담당자 (발주 또는 품목 담당)
  status?: string; // 콤마 구분
  dueFrom?: string;
  dueTo?: string;
  remain?: "Y" | "N";
  overdue?: "Y";
  soon?: "Y";
  source?: string;
  preset?: Preset;
}

export type Preset = "today" | "open" | "received" | "production" | "soon" | "overdue" | "partial" | "remain" | "delivered";

export const PRESET_LABEL: Record<Preset, string> = {
  today: "오늘 신규 발주",
  open: "전체 진행 중",
  received: "접수·발주확정",
  production: "제작/입고 대기",
  soon: "납기 임박",
  overdue: "납기 지연",
  partial: "부분납품",
  remain: "미납 남은 품목",
  delivered: "납품완료",
};

const OPEN: StatusCode[] = ["RECEIVED", "CONFIRMED", "IN_PRODUCTION", "READY", "PARTIAL"];

export function matchPreset(r: ItemRow, p: Preset, today = todayStr()): boolean {
  const s = r.effectiveStatus;
  switch (p) {
    case "today":
      return r.order.orderDate === today;
    case "open":
      return OPEN.includes(s);
    case "received":
      return s === "RECEIVED" || s === "CONFIRMED";
    case "production":
      return s === "IN_PRODUCTION";
    case "soon":
      return r.dueSoon;
    case "overdue":
      return r.overdue;
    case "partial":
      return s === "PARTIAL";
    case "remain":
      return r.remaining > 0 && s !== "CANCELLED" && s !== "ON_HOLD";
    case "delivered":
      return s === "DELIVERED";
  }
}

const has = (v: string | undefined, q: string) => !!v && v.toLowerCase().includes(q);

export function applyFilters(rows: ItemRow[], f: Filters, userName: (id?: string) => string): ItemRow[] {
  const q = f.q?.trim().toLowerCase();
  const statuses = f.status ? (f.status.split(",") as StatusCode[]) : null;
  const today = todayStr();
  return rows.filter((r) => {
    const { order: o, item: i } = r;
    if (f.from && o.orderDate < f.from) return false;
    if (f.to && o.orderDate > f.to) return false;
    if (f.division && o.division !== f.division) return false;
    if (f.orderType && o.orderType !== f.orderType) return false;
    if (f.source && o.source !== f.source) return false;
    if (f.assignee && o.assigneeId !== f.assignee && i.assigneeId !== f.assignee) return false;
    if (statuses && !statuses.includes(r.effectiveStatus)) return false;
    const due = i.dueDate ?? o.dueDate;
    if (f.dueFrom && (!due || due < f.dueFrom)) return false;
    if (f.dueTo && (!due || due > f.dueTo)) return false;
    if (f.remain === "Y" && !(r.remaining > 0 && r.effectiveStatus !== "CANCELLED")) return false;
    if (f.remain === "N" && r.remaining > 0) return false;
    if (f.overdue === "Y" && !r.overdue) return false;
    if (f.soon === "Y" && !r.dueSoon) return false;
    if (f.preset && !matchPreset(r, f.preset, today)) return false;
    if (f.customer && !has(o.customerName, f.customer.toLowerCase())) return false;
    if (f.product && !has(i.productName, f.product.toLowerCase())) return false;
    if (f.spec && !has(i.spec, f.spec.toLowerCase())) return false;
    if (f.code && !has(i.productCode, f.code.toLowerCase()) && !has(i.barcode, f.code.toLowerCase())) return false;
    if (q) {
      const hit =
        has(o.customerName, q) || has(o.orderNo, q) || has(i.productName, q) || has(i.spec, q) || has(i.productCode, q) || has(i.barcode, q) || has(i.memo, q) || has(userName(i.assigneeId ?? o.assigneeId), q);
      if (!hit) return false;
    }
    return true;
  });
}

export function filtersFromParams(p: URLSearchParams): Filters {
  const f: Record<string, string> = {};
  p.forEach((v, k) => {
    if (v) f[k] = v;
  });
  return f as Filters;
}

export function filtersToQuery(f: Filters): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v) p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}
