// 도메인 타입. supabase/migrations 의 테이블과 같은 모양(이름만 camelCase)입니다.

export type Role = "ADMIN" | "STAFF" | "VIEWER";

/** 직원 (관리자가 등록한 사람만 로그인 가능) */
export interface User {
  id: string;
  email: string;
  name: string; // 엑셀 '담당자' 값과 매칭 (예: 민구, 이슬)
  aliases: string[]; // 엑셀 표기 변형 (예: '신종현과장님' → 종현)
  role: Role;
  active: boolean;
  authUserId?: string | null; // 가입(비밀번호 설정)을 마쳤는지
}

/** 발주 구분 = 기존 엑셀 시트 출처 (새로 입력하는 발주는 '일반') */
export type OrderTypeCode = "GENERAL" | "TOOLS" | "MRO" | "MRO_SUPPLY" | "VIETNAM" | "STOCK" | "NTY";

/** 주문경로 — 엑셀 업체명 괄호 안 표기에서 추출 (예: 김OO(네이버페이)) */
export type ChannelCode = "DIRECT" | "NAVERPAY" | "COUPANG" | "OWNMALL" | "BANK" | "IMARKET" | "INTERNAL" | "ETC";

export type StatusCode =
  | "RECEIVED" // 접수
  | "CONFIRMED" // 발주확정
  | "IN_PRODUCTION" // 제작중/입고대기
  | "READY" // 납품준비
  | "PARTIAL" // 부분납품 (납품이력에서 자동 판정)
  | "DELIVERED" // 납품완료 (납품이력에서 자동 판정)
  | "ON_HOLD" // 보류
  | "CANCELLED"; // 취소

export type Currency = "KRW" | "USD" | "CNY" | "VND" | "THB";

export type OrderSource = "MANUAL" | "EXCEL_DAILY" | "EXCEL_MIGRATION";

export interface Customer {
  id: string;
  name: string;
  normalizedName: string; // 중복 판정용 (공백·(주)·주식회사 제거, 소문자)
  aliases: string[];
  kind: "B2B" | "ONLINE_PERSON" | "INTERNAL" | "OVERSEAS";
  contact?: string | null;
  shippingMethod?: string | null;
  shippingBranch?: string | null;
  memo?: string | null;
}

export interface Product {
  code: string;
  barcode?: string | null;
  name: string;
  spec?: string | null;
  unit?: string | null;
  lastPrice?: number | null;
  currency: Currency;
}

/**
 * 납품(출고) 이력. 절대 삭제하지 않고, 반품·정정은 새 행으로 남깁니다.
 *  - DELIVERY : 납품 (+수량)
 *  - RETURN   : 반품 (-수량 효과, qty 는 양수로 저장)
 *  - VOID     : 잘못 입력한 이력 무효화 (voidsId 가 가리키는 행의 효과를 상쇄)
 */
export interface Delivery {
  id: string;
  itemId: string;
  kind: "DELIVERY" | "RETURN" | "VOID";
  date: string;
  qty: number;
  voidsId?: string | null;
  handlerId?: string | null;
  memo?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  lineNo: number;
  productCode?: string | null;
  barcode?: string | null;
  productName: string;
  spec?: string | null;
  qty: number;
  cancelledQty: number; // 마감(미납 취소) 수량
  unit?: string | null;
  /** null = 단가 미입력, 0 = 실제 0원(무상) — 반드시 구분 */
  unitPrice: number | null;
  priceNote?: string | null;
  currency: Currency;
  assigneeId?: string | null;
  dueDate?: string | null;
  status: StatusCode;
  supplier?: string | null;
  memo?: string | null;
  note?: string | null;
  attrs?: Record<string, string> | null;
}

export interface Order {
  id: string;
  orderNo: string;
  orderDate: string;
  orderType: OrderTypeCode;
  customerId?: string | null;
  customerName: string;
  channel: ChannelCode;
  requester?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  memo?: string | null;
  source: OrderSource;
  importBatchId?: string | null;
  isTest: boolean;
  version: number; // 동시수정 충돌 감지
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface AuditLog {
  id: string;
  at: string;
  userId?: string | null;
  entity: string;
  entityId?: string | null;
  orderId?: string | null;
  action: string;
  field?: string | null;
  before?: string | null;
  after?: string | null;
}

export interface ImportBatch {
  id: string;
  at: string;
  userId?: string | null;
  fileName: string;
  fileHash: string;
  mode: "MIGRATION" | "DAILY";
  sheets: string[];
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

/** 엑셀 원본 행 보존 (발주로 만들지 못한 오류 행 포함) */
export interface LegacyRow {
  id: string;
  batchId: string;
  sheet: string;
  rowNo: number;
  raw: Record<string, unknown>;
  flags: { strike: "none" | "partial" | "all"; yellow: boolean; red: boolean; comments: string[] } | null;
  fingerprint: string;
  itemId?: string | null;
  issues: string[];
}

/** 사용자별 저장 화면 (필터 + 컬럼 설정) */
export interface SavedView {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, string>;
  columns: string[];
  pageSize: number;
  sort?: { key: string; dir: "asc" | "desc" } | null;
}

/** 품목 + 계산값 (목록 화면용) */
export interface ItemRow {
  order: Order;
  item: OrderItem;
  delivered: number;
  remaining: number;
  amount: number | null;
  overdue: boolean;
  dueSoon: boolean;
  effectiveStatus: StatusCode;
}
