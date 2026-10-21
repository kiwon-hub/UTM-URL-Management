// 미리보기 행 → DB 저장 묶음(import_commit 함수에 그대로 보냄). 화면과 분리해 테스트할 수 있게 둡니다.
import type { Customer } from "../types";
import type { RawSheet } from "./parse";
import type { ImportOptions, PreviewRow } from "./validate";

const SHEET_ABBR: Record<string, string> = { GENERAL: "GEN", TOOLS: "TOOLS", MRO: "MRO", MRO_SUPPLY: "MROS", VIETNAM: "VN", STOCK: "STK", NTY: "NTY" };
/** 최초 이관 발주번호: 원본 위치를 바로 알 수 있게 시트약어 + 첫 행번호 */
export const legacyOrderNo = (orderType: string, rowNo: number) => `L-${SHEET_ABBR[orderType] ?? orderType}-${String(rowNo).padStart(6, "0")}`;

export interface ImportItem {
  id: string;
  lineNo: number;
  productCode?: string | null;
  barcode?: string | null;
  productName: string;
  spec?: string | null;
  qty: number;
  unit?: string | null;
  unitPrice: number | null;
  priceNote?: string | null;
  currency: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  status: string;
  memo?: string | null;
  note?: string | null;
  attrs?: Record<string, string> | null;
}

export interface ImportOrder {
  id: string;
  presetOrderNo?: string;
  orderDate: string;
  orderType: string;
  customerName: string;
  channel: string;
  requester?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  memo?: string | null;
  items: ImportItem[];
}

export interface ImportPayload {
  batch: { fileName: string; fileHash: string; mode: "MIGRATION" | "DAILY"; sheets: string[]; total: number; skipped: number; errors: number };
  customers: Pick<Customer, "name" | "kind" | "contact" | "shippingMethod" | "shippingBranch" | "memo">[];
  orders: ImportOrder[];
  deliveries: { itemId: string; date: string; qty: number }[];
  updates: { orderNo: string; lineNo: number; patch: Record<string, unknown> }[];
  legacyRows: { sheet: string; rowNo: number; raw: Record<string, unknown>; flags: PreviewRow["flags"]; fingerprint: string; itemId: string | null; issues: string[] }[];
}

const uuid = () => crypto.randomUUID();

export function buildCommit(args: {
  previews: PreviewRow[];
  options: ImportOptions;
  fileName: string;
  fileHash: string;
  includeKeys: Set<string>; // 중복으로 표시됐지만 사용자가 등록하기로 한 행
  excludeKeys: Set<string>; // 사용자가 제외한 행
  customerSheet?: RawSheet | null;
}): ImportPayload {
  const { previews, options } = args;
  const orders: ImportOrder[] = [];
  const legacyRows: ImportPayload["legacyRows"] = [];
  const deliveries: ImportPayload["deliveries"] = [];
  const updates: ImportPayload["updates"] = [];
  const groupIdx = new Map<string, number>();
  let skipped = 0;
  let errors = 0;

  for (const p of previews) {
    const legacy = {
      sheet: p.sheet,
      rowNo: p.rowNo,
      raw: p.raw,
      flags: p.flags,
      fingerprint: p.fingerprint,
      issues: p.issues.map((i) => `${i.level === "error" ? "[오류]" : "[확인]"} ${i.field ? i.field + ": " : ""}${i.msg}`),
    };
    const take = !args.excludeKeys.has(p.key) && (p.state !== "duplicate" || args.includeKeys.has(p.key));
    if (p.state === "error" || !take) {
      if (p.state === "error") errors++;
      else skipped++;
      // 가져오지 않은 행도 원본은 보존 (데이터 손실 방지)
      legacyRows.push({ ...legacy, itemId: null });
      continue;
    }
    const f = p.fields;
    if (p.state === "update" && f.orderNo && f.lineNo) {
      const patch: Record<string, unknown> = {};
      if (f.qty !== null && f.qty > 0) patch.qty = f.qty;
      if (f.unitPrice !== null) patch.unit_price = f.unitPrice;
      if (f.memo) patch.memo = f.memo;
      if (f.note) patch.note = f.note;
      if (f.dueDate) patch.due_date = f.dueDate;
      if (f.assigneeId) patch.assignee_id = f.assigneeId;
      if (f.spec) patch.spec = f.spec;
      updates.push({ orderNo: f.orderNo, lineNo: f.lineNo, patch });
      legacyRows.push({ ...legacy, itemId: null });
      continue;
    }
    let oi = groupIdx.get(p.groupKey);
    if (oi === undefined) {
      oi = orders.length;
      groupIdx.set(p.groupKey, oi);
      orders.push({
        id: uuid(),
        presetOrderNo: options.mode === "MIGRATION" ? legacyOrderNo(p.orderType, p.rowNo) : undefined,
        orderDate: f.orderDate!,
        orderType: p.orderType,
        customerName: f.customerName,
        channel: f.channel,
        requester: f.requester ?? null,
        assigneeId: f.assigneeId,
        dueDate: f.dueDate,
        memo: options.mode === "MIGRATION" ? `엑셀 ${p.sheet} ${p.rowNo}행${options.grouping === "CONSECUTIVE" ? "~ (연속행 묶음)" : ""}` : null,
        items: [],
      });
    }
    const order = orders[oi];
    const itemId = uuid();
    order.items.push({
      id: itemId,
      lineNo: order.items.length + 1,
      productCode: f.productCode,
      barcode: f.barcode,
      productName: f.productName,
      spec: f.spec,
      qty: f.qty ?? 0,
      unit: f.unit,
      unitPrice: f.unitPrice,
      priceNote: f.priceNote ?? null,
      currency: f.currency,
      assigneeId: f.assigneeId,
      dueDate: f.dueDate,
      status: p.suggestedStatus,
      memo: f.memo,
      note: [f.note, f.qty === null ? "수량 확인 필요(원본 공란)" : null].filter(Boolean).join(" / ") || null,
      attrs: Object.keys(f.attrs).length ? f.attrs : null,
    });
    if (p.autoDelivery && p.autoDelivery.date && p.autoDelivery.qty > 0) deliveries.push({ itemId, date: p.autoDelivery.date, qty: p.autoDelivery.qty });
    legacyRows.push({ ...legacy, itemId });
  }

  const customers: ImportPayload["customers"] = [];
  if (args.customerSheet) {
    const h = args.customerSheet.headers;
    const col = (name: string) => h.findIndex((x) => x.includes(name));
    const [cName, cMethod, cBranch, cContact, cMemo] = [col("업체명"), col("배송방법"), col("배송지"), col("연락처"), col("비고")];
    for (const r of args.customerSheet.rows) {
      const name = r.cells[cName];
      if (typeof name !== "string" || !name.trim()) continue;
      const s = (i: number) => (i >= 0 && r.cells[i] !== null ? String(r.cells[i]).trim() : null);
      customers.push({ name: name.trim(), kind: "B2B", shippingMethod: s(cMethod), shippingBranch: s(cBranch), contact: s(cContact), memo: s(cMemo) });
    }
  }

  return {
    batch: { fileName: args.fileName, fileHash: args.fileHash, mode: options.mode, sheets: [...new Set(previews.map((p) => p.sheet))], total: previews.length, skipped, errors },
    customers,
    orders,
    deliveries,
    updates,
    legacyRows,
  };
}
