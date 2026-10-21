import type { ChannelCode, DivisionCode, OrderTypeCode, StatusCode } from "./types";

// 상태 정의. 색약 사용자도 구분하도록 색 + 아이콘 모양 + 글자를 함께 씁니다.
// 2단계부터는 관리자 설정(statuses 테이블)에서 이름·순서·색을 바꿀 수 있습니다.
export interface StatusDef {
  code: StatusCode;
  label: string;
  icon: string; // 모양이 서로 다른 기호
  cls: string; // 배지 색 (Tailwind)
  order: number;
  open: boolean; // 진행 중으로 집계하는 상태인지
}

export const STATUSES: StatusDef[] = [
  { code: "RECEIVED", label: "접수", icon: "○", cls: "bg-slate-100 text-slate-700 ring-slate-300", order: 1, open: true },
  { code: "CONFIRMED", label: "발주확정", icon: "◆", cls: "bg-blue-50 text-blue-800 ring-blue-300", order: 2, open: true },
  { code: "IN_PRODUCTION", label: "제작중/입고대기", icon: "⚙", cls: "bg-violet-50 text-violet-800 ring-violet-300", order: 3, open: true },
  { code: "READY", label: "납품준비", icon: "▣", cls: "bg-cyan-50 text-cyan-800 ring-cyan-300", order: 4, open: true },
  { code: "PARTIAL", label: "부분납품", icon: "◐", cls: "bg-amber-50 text-amber-900 ring-amber-300", order: 5, open: true },
  { code: "DELIVERED", label: "납품완료", icon: "✔", cls: "bg-emerald-50 text-emerald-800 ring-emerald-300", order: 6, open: false },
  { code: "ON_HOLD", label: "보류", icon: "‖", cls: "bg-stone-100 text-stone-700 ring-stone-300", order: 7, open: false },
  { code: "CANCELLED", label: "취소", icon: "✕", cls: "bg-white text-stone-500 ring-stone-300 line-through", order: 8, open: false },
];

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.code, s])) as Record<StatusCode, StatusDef>;

export const DIVISIONS: { code: DivisionCode; label: string; short: string }[] = [
  { code: "TOOLS", label: "기원툴스", short: "KT" },
  { code: "MRO", label: "기원MRO", short: "KM" },
];

export const ORDER_TYPES: { code: OrderTypeCode; label: string; sheet: string; division: DivisionCode }[] = [
  { code: "TOOLS", label: "기원툴스", sheet: "기원툴스", division: "TOOLS" },
  { code: "MRO", label: "MRO(공구)", sheet: "MRO", division: "MRO" },
  { code: "MRO_SUPPLY", label: "MRO잡자재", sheet: "MRO잡자재", division: "MRO" },
  { code: "VIETNAM", label: "베트남", sheet: "베트남", division: "TOOLS" },
  { code: "STOCK", label: "기원재고", sheet: "기원재고", division: "TOOLS" },
  { code: "NTY", label: "엔티와이반도체", sheet: "엔티와이반도체", division: "TOOLS" },
];

export const CHANNELS: { code: ChannelCode; label: string; keywords: string[] }[] = [
  { code: "DIRECT", label: "직접거래", keywords: [] },
  { code: "NAVERPAY", label: "네이버페이", keywords: ["네이버페이", "네이버", "스마트스토어"] },
  { code: "COUPANG", label: "쿠팡", keywords: ["쿠팡"] },
  { code: "OWNMALL", label: "자사몰", keywords: ["자사몰"] },
  { code: "BANK", label: "무통장입금", keywords: ["무통장입금", "무통장"] },
  { code: "IMARKET", label: "아이마켓", keywords: ["아이마켓"] },
  { code: "INTERNAL", label: "자사재고", keywords: ["재고"] },
  { code: "ETC", label: "기타", keywords: [] },
];

export const label = {
  division: (c: DivisionCode) => DIVISIONS.find((d) => d.code === c)?.label ?? c,
  orderType: (c: OrderTypeCode) => ORDER_TYPES.find((d) => d.code === c)?.label ?? c,
  channel: (c: ChannelCode) => CHANNELS.find((d) => d.code === c)?.label ?? c,
};
