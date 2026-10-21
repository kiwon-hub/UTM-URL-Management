// 목록(전체 또는 필터 결과)을 엑셀로 내려받기.
// 발주번호·품목번호를 함께 넣어 두면 '기존 데이터 갱신' 업로드에 그대로 다시 쓸 수 있습니다.
import type ExcelJS from "exceljs";
import { COLUMNS } from "../columns";
import type { ItemRow } from "../types";

async function workbook() {
  const mod = await import("exceljs");
  const Excel = (mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS);
  return new Excel.Workbook();
}

function download(buf: ArrayBuffer, name: string) {
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 수식으로 해석될 수 있는 글자(=,+,-,@ 시작)는 앞에 ' 를 붙여 CSV/수식 주입을 막습니다 */
export function safeCell(v: unknown): unknown {
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(v)) return "'" + v;
  return v;
}

export async function exportRows(rows: ItemRow[], columnKeys: string[], un: (id?: string | null) => string, fileName: string) {
  const wb = await workbook();
  const ws = wb.addWorksheet("발주목록", { views: [{ state: "frozen", ySplit: 1 }] });
  const keys = [...new Set([...columnKeys, "orderNo", "lineNo"])];
  const cols = keys.map((k) => COLUMNS.find((c) => c.key === k)!).filter(Boolean);
  ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.round(c.width / 7) }));
  for (const r of rows) {
    const rec: Record<string, unknown> = {};
    for (const c of cols) rec[c.key] = c.key === "status" ? statusLabel(r) : safeCell(c.value(r, un));
    ws.addRow(rec);
  }
  ws.getRow(1).font = { bold: true };
  download(await wb.xlsx.writeBuffer(), fileName);
}

function statusLabel(r: ItemRow) {
  return ({ RECEIVED: "접수", CONFIRMED: "발주확정", IN_PRODUCTION: "제작중/입고대기", READY: "납품준비", PARTIAL: "부분납품", DELIVERED: "납품완료", ON_HOLD: "보류", CANCELLED: "취소" } as const)[r.effectiveStatus];
}

/** 업로드 오류 행만 따로 내려받기 (원본 값 + 오류 내용) */
export async function exportErrorRows(rows: { sheet: string; rowNo: number; raw: Record<string, unknown>; issues: string[] }[], fileName: string) {
  const wb = await workbook();
  const ws = wb.addWorksheet("오류행");
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw)))];
  ws.columns = [{ header: "시트", key: "_s", width: 12 }, { header: "원본 행", key: "_r", width: 8 }, { header: "오류 내용", key: "_e", width: 60 }, ...headers.map((h) => ({ header: h, key: h, width: 16 }))];
  for (const r of rows) ws.addRow({ _s: r.sheet, _r: r.rowNo, _e: r.issues.join(" / "), ...Object.fromEntries(Object.entries(r.raw).map(([k, v]) => [k, safeCell(v)])) });
  ws.getRow(1).font = { bold: true };
  download(await wb.xlsx.writeBuffer(), fileName);
}

/** 일상 등록용 표준 양식 */
export async function exportTemplate() {
  const wb = await workbook();
  const ws = wb.addWorksheet("기원툴스");
  ws.columns = ["발주일", "업체명/고객명/주문처", "코드", "바코드 번호", "상품명", "규격", "수량", "단위", "단가", "담당자", "납기일", "일정 / 진행상황", "비고", "발주번호", "품목번호"].map((h) => ({ header: h, key: h, width: 14 }));
  ws.addRow({ 발주일: new Date(), "업체명/고객명/주문처": "가람공구", 코드: "KW100229", 상품명: "AL ENDMILL 3F", 규격: "Ø2*6L*Ø6*50L*3F", 수량: 10, 단위: "EA", 단가: 7430, 담당자: "민구", 비고: "예시 행 — 지우고 사용" });
  ws.getRow(1).font = { bold: true };
  const help = wb.addWorksheet("작성안내");
  [
    "• 시트 이름으로 발주구분을 정합니다 (기원툴스 / MRO / MRO잡자재 / 베트남 / 기원재고). 업로드 화면에서 바꿀 수도 있습니다.",
    "• 단가를 비워두면 '미입력', 0을 쓰면 '0원(무상)'으로 구분해 저장합니다.",
    "• 발주번호·품목번호를 채운 행은 '기존 데이터 갱신'을 선택했을 때 해당 품목을 수정합니다 (납품이력은 바뀌지 않음).",
    "• 같은 날짜·같은 거래처의 연속된 행은 한 발주로 묶을 수 있습니다. 발주 사이에는 빈 행을 넣으면 구분됩니다.",
  ].forEach((t) => help.addRow([t]));
  help.getColumn(1).width = 110;
  download(await wb.xlsx.writeBuffer(), "기원_발주_업로드양식.xlsx");
}
