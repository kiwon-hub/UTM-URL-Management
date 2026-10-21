import { label, STATUS_MAP } from "./status";
import type { ItemRow } from "./types";

export interface ColumnDef {
  key: string;
  label: string;
  width: number;
  align?: "right";
  pinnable?: boolean;
  /** 정렬·엑셀 다운로드용 값 */
  value: (r: ItemRow, un: (id?: string | null) => string) => string | number | null;
}

export const COLUMNS: ColumnDef[] = [
  { key: "orderNo", label: "발주번호", width: 128, pinnable: true, value: (r) => r.order.orderNo },
  { key: "orderDate", label: "발주일", width: 100, pinnable: true, value: (r) => r.order.orderDate },
  { key: "customer", label: "거래처", width: 130, pinnable: true, value: (r) => r.order.customerName },
  { key: "product", label: "상품명", width: 200, pinnable: true, value: (r) => r.item.productName },
  { key: "spec", label: "규격", width: 180, value: (r) => r.item.spec ?? "" },
  { key: "status", label: "진행상태", width: 118, value: (r) => STATUS_MAP[r.effectiveStatus].order },
  { key: "qty", label: "발주수량", width: 70, align: "right", value: (r) => r.item.qty },
  { key: "delivered", label: "납품", width: 60, align: "right", value: (r) => r.delivered },
  { key: "remaining", label: "미납", width: 60, align: "right", value: (r) => r.remaining },
  { key: "unit", label: "단위", width: 50, value: (r) => r.item.unit ?? "" },
  { key: "unitPrice", label: "단가", width: 84, align: "right", value: (r) => r.item.unitPrice },
  { key: "amount", label: "금액", width: 96, align: "right", value: (r) => r.amount },
  { key: "currency", label: "통화", width: 50, value: (r) => r.item.currency },
  { key: "due", label: "납기일", width: 150, value: (r) => r.item.dueDate ?? r.order.dueDate ?? "" },
  { key: "assignee", label: "담당자", width: 70, value: (r, un) => un(r.item.assigneeId ?? r.order.assigneeId) },
  { key: "code", label: "품번", width: 90, value: (r) => r.item.productCode ?? "" },
  { key: "barcode", label: "바코드", width: 110, value: (r) => r.item.barcode ?? "" },
  { key: "orderType", label: "구분(시트)", width: 90, value: (r) => label.orderType(r.order.orderType) },
  { key: "channel", label: "주문경로", width: 80, value: (r) => label.channel(r.order.channel) },
  { key: "supplier", label: "제작/매입처", width: 90, value: (r) => r.item.supplier ?? "" },
  { key: "memo", label: "일정/진행 메모", width: 180, value: (r) => r.item.memo ?? "" },
  { key: "note", label: "비고", width: 140, value: (r) => r.item.note ?? r.order.memo ?? "" },
  { key: "source", label: "등록출처", width: 84, value: (r) => (r.order.source === "MANUAL" ? "직접입력" : r.order.source === "EXCEL_MIGRATION" ? "엑셀이관" : "엑셀업로드") },
  { key: "lineNo", label: "품목번호", width: 60, align: "right", value: (r) => r.item.lineNo },
];

export const DEFAULT_COLUMNS = [
  "orderNo", "orderDate", "customer", "product", "spec", "status", "qty", "delivered", "remaining", "unit", "unitPrice", "amount", "due", "assignee", "code", "orderType", "memo", "source",
];
export const PINNED = new Set(["orderNo", "customer", "product"]);
