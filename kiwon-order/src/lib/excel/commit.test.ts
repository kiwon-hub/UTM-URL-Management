import { describe, expect, it } from "vitest";
import { buildCommit, legacyOrderNo } from "./commit";
import { guessMapping } from "./normalize";
import type { RawSheet } from "./parse";
import { buildPreview, type ImportOptions } from "./validate";

const headers = ["날짜", "업체명/고객명/주문처", "코드", "상품명 / 규격", "수량", "단위", "단가", "담당자", "일정 / 진행상황", "비고", "발송날짜"];
const row = (rowNo: number, cells: unknown[], extra: Partial<RawSheet["rows"][number]> = {}) => ({
  rowNo, cells, extraCells: [], strike: "none" as const, yellow: false, red: false, comments: [], mergedFrom: [], blankBefore: false, ...extra,
});
const sheet: RawSheet = {
  name: "기원툴스", role: "orders", headers, blankRows: 1, mergedRanges: [],
  rows: [
    row(2, [new Date(Date.UTC(2026, 0, 8)), "가람공구", "KW106636", "센터링 엔드밀", 5, "EA", 8100, "민구", null, null, new Date(Date.UTC(2026, 0, 9))]),
    row(3, [new Date(Date.UTC(2026, 0, 8)), "가람공구", "KW106630", "센터링 엔드밀 3", 8, "ea", null, null, null, null, null]),
    row(5, [new Date(Date.UTC(2026, 0, 8)), "가람공구", "KW100239", "알루미늄 3날", 2, "EA", "무상샘플", null, null, null, null], { blankBefore: true }),
    row(6, [new Date(Date.UTC(2026, 5, 11)), "툴탑", "KW109353", "센터링 코팅", -40, "EA", 10800, null, null, null, null]),
    row(7, [new Date(Date.UTC(2026, 5, 12)), "툴탑", "KW109354", "센터링 코팅", 2, "EA", 15750, null, null, null, null], { strike: "all" }),
  ],
};
const users = [{ id: "u1", name: "민구", aliases: [] }];
const opts = (o: Partial<ImportOptions>): ImportOptions => ({ mode: "MIGRATION", baseYear: 2026, grouping: "ROW", shipDateAsDelivered: true, strikeAsCancelled: true, yellowAsDone: false, updateExisting: false, ...o });
const preview = (o: ImportOptions) => buildPreview(sheet, guessMapping(headers), { users, existingFingerprints: new Set(), existingLines: new Set(), options: o });

describe("엑셀 업로드 저장 묶음", () => {
  it("기본(행마다 1건): 합치지 않고, 오류 행도 원본 보존", () => {
    const o = opts({});
    const c = buildCommit({ previews: preview(o), options: o, fileName: "a.xlsx", fileHash: "h", includeKeys: new Set(), excludeKeys: new Set() });
    expect(c.orders).toHaveLength(4); // -40 반품 행 제외
    expect(c.legacyRows).toHaveLength(5); // 원본 5행 모두 보존
    expect(c.legacyRows.find((l) => l.rowNo === 6)?.itemId).toBeNull();
    expect(c.legacyRows.find((l) => l.rowNo === 2)?.itemId).toBe(c.orders[0].items[0].id);
    expect(c.batch.errors).toBe(1);
    expect(c.orders[0].presetOrderNo).toBe("L-TOOLS-000002");
  });
  it("단가: 빈칸은 null, 무상샘플은 0원", () => {
    const o = opts({});
    const c = buildCommit({ previews: preview(o), options: o, fileName: "a", fileHash: "h", includeKeys: new Set(), excludeKeys: new Set() });
    expect(c.orders[1].items[0].unitPrice).toBeNull();
    expect(c.orders[2].items[0].unitPrice).toBe(0);
    expect(c.orders[2].items[0].priceNote).toBe("무상샘플");
  });
  it("발송날짜 → 전량 납품 1건, 취소선 → 취소", () => {
    const o = opts({});
    const c = buildCommit({ previews: preview(o), options: o, fileName: "a", fileHash: "h", includeKeys: new Set(), excludeKeys: new Set() });
    expect(c.deliveries).toEqual([{ itemId: c.orders[0].items[0].id, date: "2026-01-09", qty: 5 }]);
    expect(c.orders[3].items[0].status).toBe("CANCELLED");
  });
  it("연속 행 묶기는 빈 행에서 끊김", () => {
    const o = opts({ grouping: "CONSECUTIVE", mode: "DAILY" });
    const c = buildCommit({ previews: preview(o), options: o, fileName: "a", fileHash: "h", includeKeys: new Set(), excludeKeys: new Set() });
    expect(c.orders.map((x) => x.items.length)).toEqual([2, 1, 1]);
    expect(c.orders[0].presetOrderNo).toBeUndefined();
  });
  it("이관 번호 형식", () => {
    expect(legacyOrderNo("VIETNAM", 92)).toBe("L-VN-000092");
  });
});
