// exceljs 로 통합문서를 읽어 '원본 행' 형태로 바꿉니다.
// 값뿐 아니라 취소선·노란 채우기·빨간 글씨·셀 메모·병합셀 정보도 함께 보존합니다.
import type ExcelJS from "exceljs";
import { sheetRole } from "./normalize";

export interface RawRow {
  rowNo: number; // 엑셀 행 번호 (1부터, 헤더 포함 기준)
  cells: unknown[]; // 헤더 열 순서대로
  extraCells: string[]; // 헤더 바깥 열에 들어 있는 값
  strike: "none" | "partial" | "all";
  yellow: boolean; // 행 전체 노란 채우기 (처리완료 표시로 추정)
  red: boolean; // 빨간 글씨 (긴급/주의 표시로 추정)
  comments: string[]; // 셀 메모
  mergedFrom: string[]; // 병합셀 때문에 값이 복사된 셀 주소
  blankBefore: boolean; // 바로 위가 빈 행(묶음 구분)인지
}

export interface RawSheet {
  name: string;
  role: "orders" | "customers" | "skip";
  headers: string[];
  rows: RawRow[];
  blankRows: number;
  mergedRanges: string[];
  stopReason?: string;
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) return "=" + String(o.formula ?? o.sharedFormula ?? "");
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    if ("error" in o) return null;
    return String(v);
  }
  if (typeof v === "string") return v.trim() === "" ? null : v;
  return v;
}

function noteText(note: ExcelJS.Cell["note"]): string | null {
  if (!note) return null;
  if (typeof note === "string") return note;
  const texts = (note as { texts?: { text: string }[] }).texts;
  return texts ? texts.map((t) => t.text).join("") : null;
}

const STOP_WORDS = ["품목코드", "총 발주 수량", "총 미납 수량"];

export function readSheet(ws: ExcelJS.Worksheet, notes?: Map<string, string>): RawSheet {
  const role = sheetRole(ws.name);
  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (c, col) => {
    headers[col - 1] = c.value === null || c.value === undefined ? "" : String(cellValue(c.value) ?? "");
  });
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  const ncol = headers.length;
  const mergedRanges: string[] = Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges ?? {});

  const rows: RawRow[] = [];
  let blankRows = 0;
  let prevBlank = false;
  let stopReason: string | undefined;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: unknown[] = [];
    const extra: string[] = [];
    let strikeCount = 0;
    let yellowCount = 0;
    let filled = 0;
    let red = false;
    const comments: string[] = [];
    const mergedFrom: string[] = [];
    row.eachCell({ includeEmpty: false }, (c, col) => {
      const v = cellValue(c.value);
      const n = noteText(c.note) || notes?.get(c.address) || null;
      if (n) comments.push(`${c.address}: ${n}`);
      if (col > ncol) {
        if (v !== null) extra.push(`${c.address}=${String(v)}`);
        return;
      }
      if (c.isMerged && c.master && c.master.address !== c.address) mergedFrom.push(c.address);
      cells[col - 1] = v;
      if (v !== null) {
        filled++;
        if (c.font?.strike) strikeCount++;
        if (c.font?.color?.argb === "FFFF0000") red = true;
      }
      const fill = c.fill as ExcelJS.FillPattern | undefined;
      if (fill?.type === "pattern" && fill.fgColor?.argb === "FFFFFF00") yellowCount++;
    });
    for (let i = 0; i < ncol; i++) if (cells[i] === undefined) cells[i] = null;

    if (filled === 0 && extra.length === 0) {
      blankRows++;
      prevBlank = true;
      continue;
    }
    const strs = cells.filter((x): x is string => typeof x === "string");
    if (strs.some((s) => STOP_WORDS.includes(s.trim()))) {
      stopReason = `${r}행부터는 발주 목록이 아닌 별도 집계표(분할납품 표)로 보여 가져오지 않았습니다. 원본 보존 대상으로만 기록합니다.`;
      break;
    }
    rows.push({
      rowNo: r,
      cells,
      extraCells: extra,
      strike: strikeCount === 0 ? "none" : strikeCount >= filled ? "all" : "partial",
      yellow: yellowCount >= Math.max(1, Math.ceil(ncol / 2)),
      red,
      comments,
      mergedFrom,
      blankBefore: prevBlank,
    });
    prevBlank = false;
  }
  // 마지막 데이터 행 이후의 빈 행은 '사이 빈 행'에서 제외
  const lastRow = rows.length ? rows[rows.length - 1].rowNo : 1;
  const between = Math.max(0, lastRow - 1 - rows.length);
  return { name: ws.name, role, headers, rows, blankRows: Math.min(blankRows, between), mergedRanges, stopReason };
}

export async function readWorkbook(buf: ArrayBuffer): Promise<RawSheet[]> {
  const mod = await import("exceljs");
  const Excel = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS);
  const wb = new Excel.Workbook();
  await wb.xlsx.load(buf);
  const notes = await readCommentTexts(buf).catch(() => new Map<string, Map<string, string>>());
  return wb.worksheets.map((ws) => readSheet(ws, notes.get(ws.name)));
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/**
 * exceljs 는 서식 없는 메모(<t> 만 있는 경우)의 글자를 읽지 못해 xlsx 내부 XML 을 직접 읽습니다.
 * 반환: 시트이름 → (셀주소 → 메모 글자)
 */
export async function readCommentTexts(buf: ArrayBuffer): Promise<Map<string, Map<string, string>>> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const text = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  const out = new Map<string, Map<string, string>>();
  const wbXml = await text("xl/workbook.xml");
  const wbRels = await text("xl/_rels/workbook.xml.rels");
  const relTarget = (xml: string, id: string) => xml.match(new RegExp(`<Relationship[^>]*Id="${id}"[^>]*Target="([^"]+)"`))?.[1] ?? xml.match(new RegExp(`<Relationship[^>]*Target="([^"]+)"[^>]*Id="${id}"`))?.[1];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = relTarget(wbRels, m[2]);
    if (!target) continue;
    const sheetPath = "xl/" + target.replace(/^\/?xl\//, "").replace(/^\.\.\//, "");
    const file = sheetPath.split("/").pop()!;
    const rels = await text(sheetPath.replace(file, `_rels/${file}.rels`));
    const cm = rels.match(/Type="[^"]*\/comments"[^>]*Target="([^"]+)"/) ?? rels.match(/Target="([^"]+)"[^>]*Type="[^"]*\/comments"/);
    if (!cm) continue;
    const xml = await text("xl/" + cm[1].replace(/^\.\.\//, "").replace(/^\/?xl\//, ""));
    const map = new Map<string, string>();
    for (const c of xml.matchAll(/<comment\b[^>]*ref="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/comment>/g)) {
      const t = [...c[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decode(x[1])).join("").replace(/\s+/g, " ").trim();
      if (t) map.set(c[1], t);
    }
    out.set(decode(m[1]), map);
  }
  return out;
}

/** 같은 파일 재업로드 탐지용 SHA-256 */
export async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(d))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
