// 원본 행 + 컬럼 매핑 → 미리보기 행 (오류·경고·중복 판정 포함)
import type { ChannelCode, Currency, OrderTypeCode, StatusCode, User } from "../types";
import {
  extractDeliveries,
  fingerprint,
  matchAssignee,
  normalizeCode,
  normalizeUnit,
  parseDate,
  parsePrice,
  parseQty,
  sheetToOrderType,
  splitCustomer,
  splitRequester,
  type FieldKey,
} from "./normalize";
import type { RawRow, RawSheet } from "./parse";

export type ImportMode = "MIGRATION" | "DAILY";

export interface ImportOptions {
  mode: ImportMode;
  baseYear: number;
  grouping: "ROW" | "CONSECUTIVE"; // 행마다 발주 1건 / 같은 날짜·거래처 연속행 묶기
  shipDateAsDelivered: boolean; // 발송날짜가 있으면 전량 납품으로 등록
  strikeAsCancelled: boolean; // 취소선 행은 취소 상태로
  yellowAsDone: boolean; // 노란 행은 납품완료로 (가설, 기본 꺼짐)
  updateExisting: boolean; // 발주번호+품목번호가 있으면 기존 품목 갱신
}

export interface Issue {
  level: "error" | "warn";
  field?: string;
  msg: string;
}

export interface PreviewFields {
  orderDate: string | null;
  customerRaw: string;
  customerName: string;
  channel: ChannelCode;
  requester?: string;
  productCode: string | null;
  barcode: string | null;
  productName: string;
  spec: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  currency: Currency;
  priceNote?: string;
  assigneeId: string | null;
  assigneeRaw?: string;
  memo: string | null;
  note: string | null;
  shipDate: string | null;
  dueDate: string | null;
  orderNo: string | null;
  lineNo: number | null;
  attrs: Record<string, string>;
}

export interface PreviewRow {
  key: string; // 시트!행
  sheet: string;
  rowNo: number;
  orderType: OrderTypeCode;
  fields: PreviewFields;
  issues: Issue[];
  state: "ok" | "warn" | "error" | "duplicate" | "update";
  suggestedStatus: StatusCode;
  autoDelivery: { date: string; qty: number } | null;
  textDeliveries: { date: string; qty: number; raw: string }[];
  groupKey: string;
  fingerprint: string;
  raw: Record<string, unknown>; // 원본 그대로 (legacy_rows 에 저장)
  flags: { strike: RawRow["strike"]; yellow: boolean; red: boolean; comments: string[] };
}

function productName0(row: RawRow, mapping: FieldKey[]) {
  const i = mapping.indexOf("productName");
  return i >= 0 && row.cells[i] !== null;
}

const str = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim() || null);

export function buildPreview(
  sheet: RawSheet,
  mapping: FieldKey[],
  ctx: {
    users: Pick<User, "id" | "name" | "aliases">[];
    existingFingerprints: Set<string>;
    existingLines: Set<string>; // `${orderNo}#${lineNo}`
    options: ImportOptions;
    orderType?: OrderTypeCode; // 시트 이름으로 알 수 없을 때 직접 지정
  },
): PreviewRow[] {
  const orderType = ctx.orderType ?? sheetToOrderType(sheet.name) ?? "GENERAL";
  const defaultCurrency: Currency = orderType === "VIETNAM" ? "USD" : "KRW";
  const { options } = ctx;
  const seen = new Map<string, string>();
  let group = 0;
  let prevGroupBase = "";

  return sheet.rows.map((row) => {
    const issues: Issue[] = [];
    const get = (f: FieldKey) => {
      const i = mapping.indexOf(f);
      return i >= 0 ? row.cells[i] : null;
    };
    const raw: Record<string, unknown> = {};
    sheet.headers.forEach((h, i) => (raw[h || `열${i + 1}`] = row.cells[i] instanceof Date ? str(row.cells[i]) : row.cells[i]));
    if (row.extraCells.length) issues.push({ level: "warn", msg: `헤더 밖 열에 값이 있어 원본에만 보존: ${row.extraCells.join(", ")}` });
    if (row.mergedFrom.length) issues.push({ level: "warn", msg: `병합셀 값 복사됨: ${row.mergedFrom.join(", ")}` });

    // 날짜
    const d = parseDate(get("orderDate"), options.baseYear);
    if (d.error) issues.push({ level: "error", field: "발주일", msg: d.error });
    else if (d.warn) issues.push({ level: "warn", field: "발주일", msg: d.warn });
    if (!d.value && !d.error) issues.push({ level: "error", field: "발주일", msg: "발주일 누락" });

    // 거래처 (베트남: '발주자/업체')
    const custRaw = str(get("customerName")) ?? "";
    let customerName = "";
    let channel: ChannelCode = "DIRECT";
    let requester: string | undefined;
    if (orderType === "VIETNAM") {
      const s = splitRequester(custRaw);
      requester = s.requester;
      customerName = s.customer;
    } else {
      const s = splitCustomer(custRaw);
      customerName = s.name;
      channel = s.channel;
    }
    if (!customerName) {
      if (options.mode === "MIGRATION" && productName0(row, mapping)) {
        customerName = "(거래처 미기재)";
        issues.push({ level: "warn", field: "거래처", msg: "거래처 미기재 — '(거래처 미기재)'로 등록 후 확인 필요" });
      } else issues.push({ level: "error", field: "거래처", msg: "거래처/주문처 누락" });
    }

    const code = normalizeCode(get("productCode"));
    if (code.warn) issues.push({ level: "warn", field: "품번", msg: code.warn });

    let productName = str(get("productName")) ?? "";
    let spec = str(get("spec"));
    if (typeof get("spec") === "object" && get("spec") instanceof Date) {
      issues.push({ level: "warn", field: "규격", msg: "규격 칸이 날짜로 바뀌어 있음(엑셀 자동변환) — 원본 확인 필요" });
    }
    if (!productName && spec) {
      productName = spec;
      spec = null;
    }
    if (!productName) issues.push({ level: "error", field: "상품명", msg: "상품명 누락" });

    const q = parseQty(get("qty"));
    if (q.error) issues.push({ level: "error", field: "수량", msg: q.error });
    else if (q.warn) issues.push({ level: "warn", field: "수량", msg: q.warn });
    if (q.value === null && !q.error) {
      if (options.mode === "MIGRATION") issues.push({ level: "warn", field: "수량", msg: "수량 미입력 — '수량 확인 필요'로 표시해 등록 (수량 0)" });
      else issues.push({ level: "error", field: "수량", msg: "수량 누락" });
    }

    const p = parsePrice(get("unitPrice"), defaultCurrency);
    if (p.error) issues.push({ level: "error", field: "단가", msg: p.error });
    else if (p.warn) issues.push({ level: "warn", field: "단가", msg: p.warn });

    const a = matchAssignee(get("assignee"), ctx.users);
    if (a.warn) issues.push({ level: "warn", field: "담당자", msg: a.warn });

    const sd = parseDate(get("shipDate"), options.baseYear);
    if (sd.error) issues.push({ level: "warn", field: "발송날짜", msg: `${sd.error} — 비고에 보존` });
    else if (sd.warn) issues.push({ level: "warn", field: "발송날짜", msg: sd.warn });
    const due = parseDate(get("dueDate"), options.baseYear);

    let note = str(get("note"));
    if (sd.error) note = [note, `발송날짜 원문: ${str(get("shipDate"))}`].filter(Boolean).join(" / ");
    if (a.warn && typeof get("assignee") === "string") note = [note, `담당자 원문: ${str(get("assignee"))}`].filter(Boolean).join(" / ");

    const attrs: Record<string, string> = {};
    mapping.forEach((f, i) => {
      if (f.startsWith("attr:") && row.cells[i] !== null) attrs[f.slice(5)] = str(row.cells[i])!;
    });
    if (row.comments.length) attrs["셀메모"] = row.comments.join(" | ");

    const memo = str(get("memo"));
    const textDeliveries = extractDeliveries([memo, note, ...row.comments].filter(Boolean).join(" "), options.baseYear);
    if (textDeliveries.length) issues.push({ level: "warn", msg: `메모에서 납품 기록 ${textDeliveries.length}건 발견(${textDeliveries.map((t) => t.raw).join(", ")}) — 확인 후 납품이력으로 등록 권장` });
    if (/미납|마감/.test([memo, note, ...row.comments].join(" "))) issues.push({ level: "warn", msg: "메모에 미납/마감 언급 — 미납·마감수량 확인 필요" });

    // 상태 제안
    let suggestedStatus: StatusCode = "RECEIVED";
    let autoDelivery: PreviewRow["autoDelivery"] = null;
    const qty = q.value ?? 0;
    if (row.strike !== "none") {
      if (options.strikeAsCancelled && row.strike === "all") suggestedStatus = "CANCELLED";
      issues.push({ level: "warn", msg: row.strike === "all" ? "취소선 행 — 취소 건으로 추정" : "일부 셀에만 취소선 — 확인 필요" });
    }
    if (suggestedStatus !== "CANCELLED" && qty > 0) {
      if (sd.value && options.shipDateAsDelivered && textDeliveries.length === 0) {
        autoDelivery = { date: sd.value, qty };
        suggestedStatus = "DELIVERED";
      } else if (row.yellow && options.yellowAsDone) {
        autoDelivery = { date: sd.value ?? d.value ?? "", qty };
        suggestedStatus = "DELIVERED";
      }
    }

    const fields: PreviewFields = {
      orderDate: d.value,
      customerRaw: custRaw,
      customerName,
      channel,
      requester,
      productCode: code.value,
      barcode: str(get("barcode")),
      productName,
      spec,
      qty: q.value,
      unit: normalizeUnit(get("unit")),
      unitPrice: p.value,
      currency: p.currency,
      priceNote: p.note,
      assigneeId: a.value,
      assigneeRaw: str(get("assignee")) ?? undefined,
      memo,
      note,
      shipDate: sd.value,
      dueDate: due.value,
      orderNo: str(get("orderNo")),
      lineNo: get("lineNo") === null ? null : Number(get("lineNo")),
      attrs,
    };

    const fp = fingerprint([sheet.name, d.value, custRaw, code.value, productName, spec, q.value, str(get("unitPrice"))]);
    let state: PreviewRow["state"] = issues.some((i) => i.level === "error") ? "error" : issues.length ? "warn" : "ok";
    if (state !== "error") {
      if (options.updateExisting && fields.orderNo && fields.lineNo && ctx.existingLines.has(`${fields.orderNo}#${fields.lineNo}`)) {
        state = "update";
      } else if (ctx.existingFingerprints.has(fp)) {
        state = "duplicate";
        issues.push({ level: "warn", msg: "이미 등록된 행과 같은 내용 — 기본값: 건너뜀" });
      } else if (seen.has(fp)) {
        issues.push({ level: "warn", msg: `같은 파일 안에서 ${seen.get(fp)} 행과 내용이 같음 — 실제 중복 주문인지 확인` });
        state = "warn";
      }
    }
    if (!seen.has(fp)) seen.set(fp, `${row.rowNo}`);

    const base = `${d.value}|${custRaw}`;
    if (options.grouping === "ROW" || row.blankBefore || base !== prevGroupBase) group++;
    prevGroupBase = base;

    return {
      key: `${sheet.name}!${row.rowNo}`,
      sheet: sheet.name,
      rowNo: row.rowNo,
      orderType,
      fields,
      issues,
      state,
      suggestedStatus,
      autoDelivery,
      textDeliveries,
      groupKey: `${sheet.name}#${group}`,
      fingerprint: fp,
      raw,
      flags: { strike: row.strike, yellow: row.yellow, red: row.red, comments: row.comments },
    };
  });
}

export function summarize(rows: PreviewRow[]) {
  const c = { total: rows.length, ok: 0, warn: 0, error: 0, duplicate: 0, update: 0, groups: new Set<string>() };
  for (const r of rows) {
    c[r.state]++;
    if (r.state !== "error" && r.state !== "duplicate") c.groups.add(r.groupKey);
  }
  return { ...c, orders: c.groups.size };
}
