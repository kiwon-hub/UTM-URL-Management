// 미리보기 행 → 저장 묶음(ImportCommit). 화면과 분리해 테스트할 수 있게 둡니다.
import type { ImportCommit, NewOrderInput } from "../store";
import type { Customer } from "../types";
import type { RawSheet } from "./parse";
import type { ImportOptions, PreviewRow } from "./validate";

const SHEET_ABBR: Record<string, string> = { TOOLS: "TOOLS", MRO: "MRO", MRO_SUPPLY: "MROS", VIETNAM: "VN", STOCK: "STK", NTY: "NTY" };
/** 최초 이관 발주번호: 원본 위치를 바로 알 수 있게 시트약어 + 첫 행번호 */
export const legacyOrderNo = (orderType: string, rowNo: number) => `L-${SHEET_ABBR[orderType] ?? orderType}-${String(rowNo).padStart(6, "0")}`;

export function buildCommit(args: {
  previews: PreviewRow[];
  options: ImportOptions;
  fileName: string;
  fileHash: string;
  includeKeys: Set<string>; // 중복으로 표시됐지만 사용자가 등록하기로 한 행
  excludeKeys: Set<string>; // 사용자가 제외한 행
  customerSheet?: RawSheet | null;
}): ImportCommit {
  const { previews, options } = args;
  const orders: NewOrderInput[] = [];
  const rowLinks: ImportCommit["rowLinks"] = [];
  const deliveries: ImportCommit["deliveries"] = [];
  const updates: ImportCommit["updates"] = [];
  const groupIdx = new Map<string, number>();
  let skipped = 0;
  let errors = 0;

  for (const p of previews) {
    const legacy = { sheet: p.sheet, rowNo: p.rowNo, raw: p.raw, flags: p.flags, fingerprint: p.fingerprint, issues: p.issues.map((i) => `${i.level === "error" ? "[오류]" : "[확인]"} ${i.field ? i.field + ": " : ""}${i.msg}`) };
    const take = !args.excludeKeys.has(p.key) && (p.state !== "duplicate" || args.includeKeys.has(p.key));
    if (p.state === "error" || !take) {
      if (p.state === "error") errors++;
      else skipped++;
      // 가져오지 않은 행도 원본은 보존 (데이터 손실 방지)
      rowLinks.push({ legacy, orderIdx: null, itemIdx: null });
      continue;
    }
    const f = p.fields;
    if (p.state === "update" && f.orderNo && f.lineNo) {
      const patch: Record<string, unknown> = {};
      if (f.qty !== null && f.qty > 0) patch.qty = f.qty;
      if (f.unitPrice !== null) patch.unitPrice = f.unitPrice;
      if (f.memo) patch.memo = f.memo;
      if (f.note) patch.note = f.note;
      if (f.dueDate) patch.dueDate = f.dueDate;
      if (f.assigneeId) patch.assigneeId = f.assigneeId;
      if (f.spec) patch.spec = f.spec;
      updates.push({ orderNo: f.orderNo, lineNo: f.lineNo, patch });
      rowLinks.push({ legacy, orderIdx: null, itemIdx: null });
      continue;
    }
    let oi = groupIdx.get(p.groupKey);
    if (oi === undefined) {
      oi = orders.length;
      groupIdx.set(p.groupKey, oi);
      orders.push({
        orderDate: f.orderDate!,
        division: p.division,
        orderType: p.orderType,
        customerName: f.customerName,
        channel: f.channel,
        requester: f.requester,
        assigneeId: f.assigneeId ?? undefined,
        dueDate: f.dueDate ?? undefined,
        memo: options.mode === "MIGRATION" ? `엑셀 ${p.sheet} ${p.rowNo}행${options.grouping === "CONSECUTIVE" ? "~ (연속행 묶음)" : ""}` : undefined,
        source: options.mode === "MIGRATION" ? "EXCEL_MIGRATION" : "EXCEL_DAILY",
        presetOrderNo: options.mode === "MIGRATION" ? legacyOrderNo(p.orderType, p.rowNo) : undefined,
        items: [],
      });
    }
    const order = orders[oi];
    const qty = f.qty ?? 0;
    const itemIdx = order.items.length;
    order.items.push({
      productCode: f.productCode ?? undefined,
      barcode: f.barcode ?? undefined,
      productName: f.productName,
      spec: f.spec ?? undefined,
      qty,
      cancelledQty: 0,
      unit: f.unit ?? undefined,
      unitPrice: f.unitPrice,
      priceNote: f.priceNote,
      currency: f.currency,
      assigneeId: f.assigneeId ?? undefined,
      dueDate: f.dueDate ?? undefined,
      status: p.suggestedStatus,
      memo: f.memo ?? undefined,
      note: [f.note, f.qty === null ? "수량 확인 필요(원본 공란)" : null].filter(Boolean).join(" / ") || undefined,
      attrs: Object.keys(f.attrs).length ? f.attrs : undefined,
    });
    if (p.autoDelivery && p.autoDelivery.date) deliveries.push({ orderIdx: oi, itemIdx, date: p.autoDelivery.date, qty: p.autoDelivery.qty });
    rowLinks.push({ legacy, orderIdx: oi, itemIdx });
  }

  const customers: Omit<Customer, "id" | "normalizedName">[] = [];
  if (args.customerSheet) {
    const h = args.customerSheet.headers;
    const col = (name: string) => h.findIndex((x) => x.includes(name));
    const [cName, cMethod, cBranch, cContact, cMemo] = [col("업체명"), col("배송방법"), col("배송지"), col("연락처"), col("비고")];
    for (const r of args.customerSheet.rows) {
      const name = r.cells[cName];
      if (typeof name !== "string" || !name.trim()) continue;
      const s = (i: number) => (i >= 0 && r.cells[i] !== null ? String(r.cells[i]).trim() : undefined);
      customers.push({ name: name.trim(), aliases: [], kind: "B2B", shippingMethod: s(cMethod), shippingBranch: s(cBranch), contact: s(cContact), memo: s(cMemo) });
    }
  }

  const inserted = orders.reduce((n, o) => n + o.items.length, 0);
  return {
    batch: {
      fileName: args.fileName,
      fileHash: args.fileHash,
      mode: options.mode,
      sheets: [...new Set(previews.map((p) => p.sheet))],
      total: previews.length,
      inserted,
      updated: updates.length,
      skipped,
      errors,
    },
    orders,
    rowLinks,
    deliveries,
    updates,
    customers,
  };
}
