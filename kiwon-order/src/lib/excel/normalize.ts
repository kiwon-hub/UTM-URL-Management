// 엑셀 값 정리 규칙. 실제 '2026_기원 발주내역서.xlsx' 에서 확인한 입력 패턴을 기준으로 만들었습니다.
// 화면(브라우저)과 서버 어디서든 쓸 수 있도록 순수 함수로만 구성합니다.
import { CHANNELS } from "../status";
import type { ChannelCode, Currency, OrderTypeCode } from "../types";

/** 시스템 필드 */
export type FieldKey =
  | "orderDate"
  | "customerName"
  | "productCode"
  | "barcode"
  | "productName"
  | "spec"
  | "qty"
  | "unit"
  | "unitPrice"
  | "assignee"
  | "memo"
  | "note"
  | "shipDate"
  | "attr:코팅"
  | "attr:헬릭스"
  | "attr:순서"
  | "attr:생산일자"
  | "orderNo"
  | "lineNo"
  | "dueDate"
  | "ignore";

export const FIELD_LABELS: Record<FieldKey, string> = {
  orderDate: "발주일",
  customerName: "거래처/주문처",
  productCode: "품번(코드)",
  barcode: "바코드",
  productName: "상품명",
  spec: "규격",
  qty: "수량",
  unit: "단위",
  unitPrice: "단가",
  assignee: "담당자",
  memo: "일정/진행 메모",
  note: "비고",
  shipDate: "발송날짜",
  "attr:코팅": "코팅(개별)",
  "attr:헬릭스": "헬릭스(개별)",
  "attr:순서": "순서(개별)",
  "attr:생산일자": "생산일자(개별)",
  orderNo: "발주번호(갱신용)",
  lineNo: "품목번호(갱신용)",
  dueDate: "납기일",
  ignore: "가져오지 않음",
};

export const REQUIRED_FIELDS: FieldKey[] = ["orderDate", "customerName", "productName", "qty"];

const SYNONYMS: [FieldKey, string[]][] = [
  ["orderDate", ["날짜", "발주일", "주문일", "일자"]],
  ["customerName", ["업체명/고객명/주문처", "업체명", "거래처", "거래처명", "발주자/업체", "고객명", "주문처"]],
  ["productCode", ["코드", "품번", "품목코드", "상품코드"]],
  ["barcode", ["바코드 넘버", "바코드 번호", "바코드", "바코드번호"]],
  ["productName", ["상품명 / 규격", "상품명/규격", "상품명", "품명", "품목명"]],
  ["spec", ["규격"]],
  ["qty", ["수량", "발주수량", "주문수량"]],
  ["unit", ["단위"]],
  ["unitPrice", ["단가", "단가($)", "단가(usd)", "단가(원)"]],
  ["assignee", ["담당자", "담당"]],
  ["memo", ["일정 / 진행상황", "일정/진행상황", "진행상황", "일정"]],
  ["note", ["비고", "메모"]],
  ["shipDate", ["발송날짜", "발송일", "출고일", "납품일"]],
  ["attr:코팅", ["코팅"]],
  ["attr:헬릭스", ["헬릭스"]],
  ["attr:순서", ["순서"]],
  ["attr:생산일자", ["생산일자"]],
  ["orderNo", ["발주번호"]],
  ["lineNo", ["품목번호", "행번호"]],
  ["dueDate", ["납기일", "요청납기", "납기"]],
];

const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 헤더 이름으로 필드를 자동 추정. 못 찾으면 ignore. */
export function guessField(header: string): FieldKey {
  const h = squash(header);
  for (const [key, names] of SYNONYMS) if (names.some((n) => squash(n) === h)) return key;
  for (const [key, names] of SYNONYMS) if (names.some((n) => h.includes(squash(n)))) return key;
  return "ignore";
}

export function guessMapping(headers: string[]): FieldKey[] {
  const used = new Set<FieldKey>();
  return headers.map((h) => {
    if (!h) return "ignore";
    const f = guessField(h);
    if (f !== "ignore" && used.has(f)) return "ignore"; // 같은 필드 두 번 매핑 방지
    used.add(f);
    return f;
  });
}

/** 시트 이름 → 발주 구분 */
export function sheetToOrderType(sheet: string): OrderTypeCode | null {
  const s = squash(sheet);
  if (s.includes("잡자재")) return "MRO_SUPPLY";
  if (s.includes("mro")) return "MRO";
  if (s.includes("베트남")) return "VIETNAM";
  if (s.includes("재고")) return "STOCK";
  if (s.includes("엔티와이")) return "NTY";
  if (s.includes("툴스")) return "TOOLS";
  return null;
}

/** 이관 대상이 아닌 시트 (계산기·마스터) */
export function sheetRole(sheet: string): "orders" | "customers" | "skip" {
  if (sheet.includes("업체 정보") || sheet.includes("업체정보")) return "customers";
  if (sheet.includes("단가 계산") || sheet.includes("계산")) return "skip";
  return sheetToOrderType(sheet) ? "orders" : "skip";
}

export type Parsed<T> = { value: T | null; warn?: string; error?: string };

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const z = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${z(m)}-${z(d)}`;
};

/**
 * 날짜 해석. 지원 형식:
 *  Date 객체, 엑셀 일련번호(46162), 2026-06-11, 2026.06.11, 26.06.10, 2026년 6/9, 6/11 (기준연도 사용)
 */
export function parseDate(v: unknown, baseYear: number): Parsed<string> {
  if (v === null || v === undefined || v === "") return { value: null };
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return { value: `${v.getUTCFullYear()}-${z(v.getUTCMonth() + 1)}-${z(v.getUTCDate())}` };
  }
  if (typeof v === "number") {
    if (v > 40000 && v < 60000) {
      const d = new Date(EXCEL_EPOCH + Math.round(v) * 86400000);
      return { value: `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`, warn: "날짜가 숫자(엑셀 일련번호)로 입력되어 변환했습니다" };
    }
    return { value: null, error: `날짜로 볼 수 없는 숫자: ${v}` };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?$/);
  if (m) return ok(ymd(+m[1], +m[2], +m[3]), s);
  m = s.match(/^(\d{2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) return ok(ymd(2000 + +m[1], +m[2], +m[3]), s, "2자리 연도를 20xx년으로 해석했습니다");
  m = s.match(/^(\d{4})년\s*(\d{1,2})[/월]\s*(\d{1,2})일?$/);
  if (m) return ok(ymd(+m[1], +m[2], +m[3]), s);
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return ok(ymd(baseYear, +m[1], +m[2]), s, `연도가 없어 ${baseYear}년으로 해석했습니다`);
  return { value: null, error: `날짜 형식 아님: "${s}"` };
}
function ok(value: string | null, raw: string, warn?: string): Parsed<string> {
  return value ? { value, warn } : { value: null, error: `존재하지 않는 날짜: "${raw}"` };
}

/** 수량. 음수는 반품 행으로 경고, 0은 경고. */
export function parseQty(v: unknown): Parsed<number> {
  if (v === null || v === undefined || v === "") return { value: null };
  if (v instanceof Date) return { value: null, error: "수량 칸이 날짜로 자동변환되어 있음 — 원본 확인 필요" };
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").replace(/(ea|개|EA)$/i, "").trim());
  if (!Number.isFinite(n)) return { value: null, error: `수량이 숫자가 아님: "${String(v)}"` };
  if (n < 0) return { value: n, error: "음수 수량(반품/정정 행) — 발주로 만들지 않고 원본만 보존합니다. 원래 품목의 납품이력에 '반품'으로 등록하세요" };
  if (n === 0) return { value: 0, warn: "수량 0" };
  return { value: n };
}

const FREE_WORDS = ["무상샘플", "무상 샘플", "무상출고", "무상", "샘플"];

/**
 * 단가. 빈칸(null)과 0원을 구분합니다.
 *  - "$ 7.10" → 7.10 USD
 *  - "무상샘플" 등 → 0원 + 메모 (명시적 무상)
 *  - "교환" 등 기타 글자 → 단가 없음(null) + 메모
 *  - 수식("=ROUNDUP(…)") → 계산 결과를 못 믿으므로 null + 경고
 */
export function parsePrice(v: unknown, defaultCurrency: Currency): Parsed<number> & { currency: Currency; note?: string } {
  const base = { currency: defaultCurrency };
  if (v === null || v === undefined || v === "") return { ...base, value: null };
  if (typeof v === "number") return { ...base, value: v };
  const s = String(v).trim();
  if (s.startsWith("=")) return { ...base, value: null, warn: `단가가 수식으로 입력됨(${s.slice(0, 30)}) — 원본 확인 필요` };
  const usd = s.match(/^\$\s*([\d,]+(?:\.\d+)?)$/);
  if (usd) return { value: Number(usd[1].replace(/,/g, "")), currency: "USD" };
  const num = s.replace(/[,원\s]/g, "");
  if (/^\d+(\.\d+)?$/.test(num)) return { ...base, value: Number(num) };
  if (FREE_WORDS.some((w) => s.replace(/\s/g, "") === w.replace(/\s/g, ""))) return { ...base, value: 0, note: s, warn: `"${s}" → 0원(무상)으로 등록` };
  return { ...base, value: null, note: s, warn: `단가 칸에 글자 "${s}" — 단가 없음으로 두고 메모에 보존` };
}

/** 업체명 "김OO(네이버페이)" → 이름 + 주문경로 */
export function splitCustomer(raw: string): { name: string; channel: ChannelCode; channelText?: string } {
  const s = raw.trim().replace(/\s+/g, " ");
  const m = s.match(/^(.*?)[(（]([^()（）]+)[)）]\s*$/);
  const inside = m?.[2]?.trim();
  const outside = m?.[1]?.trim();
  if (m && inside && outside) {
    const ch = CHANNELS.find((c) => c.keywords.some((k) => inside.includes(k)));
    if (ch) return { name: outside, channel: ch.code, channelText: inside };
    // "아이마켓(진양오일씰)" 처럼 경로가 바깥에 있는 경우
    const ch2 = CHANNELS.find((c) => c.code !== "INTERNAL" && c.keywords.some((k) => outside.includes(k)));
    if (ch2) return { name: inside, channel: ch2.code, channelText: outside };
  }
  if (/재고/.test(s)) return { name: s, channel: "INTERNAL" };
  return { name: s, channel: "DIRECT" };
}

/** 베트남 시트 "HAI/KISHIN" → 발주자 HAI, 거래처 KISHIN */
export function splitRequester(raw: string): { requester?: string; customer: string } {
  const i = raw.indexOf("/");
  if (i <= 0) return { customer: raw.trim() };
  return { requester: raw.slice(0, i).trim(), customer: raw.slice(i + 1).trim() };
}

/** 거래처 중복 판정용 이름 */
export function normalizeName(s: string): string {
  return s
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
    .replace(/[\s·.,\-_()（）]/g, "")
    .toLowerCase();
}

/** 품번: 공백·줄바꿈 제거, kw→KW. 형식이 다르면 경고만 하고 원본 유지 */
export function normalizeCode(v: unknown): Parsed<string> {
  if (v === null || v === undefined || v === "") return { value: null };
  if (typeof v === "string" && v.startsWith("=")) return { value: null, warn: "품번 칸에 수식 — 무시했습니다" };
  const raw = typeof v === "number" ? String(Math.round(v)) : String(v);
  const s = raw.replace(/\s+/g, "").replace(/^kw/i, "KW");
  if (/^KW\d{6}$/.test(s)) return { value: s, warn: s !== raw ? "품번의 공백/대소문자를 정리했습니다" : undefined };
  if (/^\d{6}$/.test(s)) return { value: s, warn: "품번이 숫자만 있음 — 'KW' 접두 여부 확인 필요" };
  return { value: s, warn: `표준 형식(KW+6자리)이 아닌 품번: ${s}` };
}

const UNIT_MAP: Record<string, string> = { ea: "EA", 개: "EA", pk: "PK", box: "BOX", 박스: "BOX", set: "SET" };
export function normalizeUnit(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  return UNIT_MAP[s.toLowerCase()] ?? s;
}

/** 엑셀 담당자 표기 → 사용자 id (별칭 포함) */
export function matchAssignee(raw: unknown, users: { id: string; name: string; aliases: string[] }[]): Parsed<string> {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  if (typeof raw === "number") return { value: null, warn: `담당자 칸에 숫자(${raw}) — 다른 열 값이 잘못 들어간 것으로 보입니다` };
  const s = String(raw).replace(/\s/g, "");
  const u = users.find((x) => x.name === s || x.aliases.some((a) => a.replace(/\s/g, "") === s));
  if (u) return { value: u.id };
  return { value: null, warn: `등록되지 않은 담당자 "${s}" — 비고에 보존` };
}

/**
 * 비고·메모 속 납품 기록 추출 (제안용, 자동 확정하지 않음)
 * 예) "1/19 30개발송 / 1/23 48개 발송", "3/20 200개 출고", "5/11 3개 출고"
 */
export function extractDeliveries(text: string, baseYear: number): { date: string; qty: number; raw: string }[] {
  const out: { date: string; qty: number; raw: string }[] = [];
  const re = /(\d{1,2})\/(\d{1,2})\s*(\d+)\s*(?:개|ea|EA|봉|포대|켤레|묶음)?\s*(?:발송|출고|납품)/g;
  for (const m of text.matchAll(re)) {
    const date = ymd(baseYear, +m[1], +m[2]);
    if (date) out.push({ date, qty: +m[3], raw: m[0] });
  }
  return out;
}

/** 중복 판정용 지문: 같은 시트·날짜·거래처·품목·수량·단가면 같은 행으로 봅니다. */
export function fingerprint(parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => (p === null || p === undefined ? "" : String(p).replace(/\s+/g, " ").trim().toLowerCase())).join("|");
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + ":" + s.length;
}
