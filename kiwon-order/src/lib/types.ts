// 도메인 타입. prisma/schema.prisma 와 1:1로 맞춰 둡니다.
// 1단계 시안에서는 브라우저 메모리(+localStorage)에 저장하고,
// 2단계부터 같은 모양 그대로 PostgreSQL 로 옮깁니다.

export type Role = "ADMIN" | "STAFF" | "VIEWER";

export interface User {
  id: string;
  name: string; // 엑셀 '담당자' 값과 매칭 (예: 민구, 이슬)
  aliases: string[]; // 엑셀 표기 변형 (예: '신종현과장님' → 종현)
  role: Role;
  divisions: DivisionCode[]; // 등록/수정 가능 사업부 (관리자 설정)
}

/** 사업부 */
export type DivisionCode = "TOOLS" | "MRO";

/** 발주 구분 = 기존 엑셀 시트 구분을 그대로 보존 */
export type OrderTypeCode =
  | "TOOLS" // 기원툴스 시트
  | "MRO" // MRO 시트 (공구)
  | "MRO_SUPPLY" // MRO잡자재 시트 (장갑·보루 등 소모품, 온라인 주문)
  | "VIETNAM" // 베트남 시트 (USD 단가)
  | "STOCK" // 기원재고 시트 (자사 재고 생산 요청)
  | "NTY"; // 엔티와이반도체 시트 (거래처 전용 분할납품 관리)

/** 주문경로 — 엑셀 업체명 괄호 안 표기에서 추출 (예: 김OO(네이버페이)) */
export type ChannelCode =
  | "DIRECT" // 전화·메일·방문 등 직접 거래
  | "NAVERPAY"
  | "COUPANG"
  | "OWNMALL" // 자사몰
  | "BANK" // 무통장입금
  | "IMARKET" // 아이마켓
  | "INTERNAL" // 자사 재고 보충
  | "ETC";

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
  name: string; // 정식 거래처명
  normalizedName: string; // 중복 판정용 (공백·(주)·주식회사 제거, 소문자)
  aliases: string[]; // 엑셀 표기 변형 (예: 'MRO 재고', 'MRO재고')
  kind: "B2B" | "ONLINE_PERSON" | "INTERNAL" | "OVERSEAS";
  contact?: string; // 배송담당자/연락처
  shippingMethod?: string; // 로젠택배, 경동화물, 대신화물 …
  shippingBranch?: string; // 배송지(화물지점)
  memo?: string;
}

export interface Product {
  code: string; // 품번 (KW + 6자리 권장)
  barcode?: string;
  name: string;
  spec?: string;
  unit: string;
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
  date: string; // YYYY-MM-DD
  qty: number; // 항상 양수
  voidsId?: string;
  handlerId: string; // 처리 담당자
  memo?: string;
  createdAt: string;
  createdBy: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  lineNo: number;
  productCode?: string; // 품번(코드)
  barcode?: string;
  productName: string;
  spec?: string;
  qty: number; // 발주수량
  cancelledQty: number; // 취소/마감 처리 수량 ('미납 수량 마감처리' 대응)
  unit?: string;
  /** null = 단가 미입력, 0 = 실제 0원(무상) — 반드시 구분 */
  unitPrice: number | null;
  priceNote?: string; // '무상샘플', '교환' 등 단가 칸의 문자 메모
  currency: Currency;
  assigneeId?: string; // 품목별 담당자
  dueDate?: string; // 품목별 납기
  status: StatusCode;
  supplier?: string; // 제작/매입처 (엑셀 '일정/진행상황'에 적힌 업체명)
  memo?: string; // 제작·입고 메모 (엑셀 '일정/진행상황')
  note?: string; // 엑셀 '비고'
  attrs?: Record<string, string>; // 시트별 개별 항목: 코팅, 헬릭스, 순서, 생산일자 …
  legacyRowId?: string; // 엑셀 원본행 참조
}

export interface Order {
  id: string;
  orderNo: string;
  orderDate: string;
  division: DivisionCode;
  orderType: OrderTypeCode;
  customerId?: string;
  customerName: string; // 등록 당시 표기 그대로
  channel: ChannelCode;
  requester?: string; // 발주자 (베트남 시트 'HAI/…' 의 앞부분 등)
  assigneeId?: string;
  dueDate?: string;
  memo?: string;
  source: OrderSource;
  importBatchId?: string;
  version: number; // 동시수정 충돌 감지 (낙관적 잠금)
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditLog {
  id: string;
  at: string;
  userId: string;
  entity: "order" | "item" | "delivery" | "customer";
  entityId: string;
  orderId?: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS" | "IMPORT";
  field?: string;
  before?: string;
  after?: string;
}

export interface ImportBatch {
  id: string;
  at: string;
  userId: string;
  fileName: string;
  fileHash: string; // 같은 파일 재업로드 탐지
  mode: "MIGRATION" | "DAILY";
  sheets: string[];
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

/** 품목 + 계산값 (목록 화면용) */
export interface ItemRow {
  order: Order;
  item: OrderItem;
  delivered: number; // 누적 유효 납품수량
  remaining: number; // 잔여 미납수량
  amount: number | null; // 단가 미입력이면 null
  overdue: boolean;
  dueSoon: boolean;
  effectiveStatus: StatusCode;
}

/** 엑셀 원본 행 보존 (발주로 만들지 못한 오류 행 포함) */
export interface LegacyRow {
  id: string;
  batchId: string;
  sheet: string;
  rowNo: number;
  raw: Record<string, unknown>;
  flags: { strike: "none" | "partial" | "all"; yellow: boolean; red: boolean; comments: string[] };
  fingerprint: string;
  itemId?: string; // 연결된 품목 (오류 행은 없음)
  issues: string[];
}

/** 사용자별 저장 화면 (필터 + 컬럼 설정) */
export interface SavedView {
  id: string;
  userId: string;
  name: string;
  filters: Record<string, string>;
  columns: string[]; // 표시 순서
  pageSize: number;
  sort?: { key: string; dir: "asc" | "desc" };
}
