import { describe, expect, it } from "vitest";
import { extractDeliveries, guessMapping, normalizeCode, normalizeName, parseDate, parsePrice, parseQty, sheetRole, splitCustomer, splitRequester } from "./normalize";

describe("헤더 자동 매핑", () => {
  it("기원툴스 시트 헤더", () => {
    const m = guessMapping(["날짜", "업체명/고객명/주문처", "코드", "바코드 넘버", "상품명 / 규격", "수량", "단위", "단가", "담당자", "일정 / 진행상황", "비고", "발송날짜"]);
    expect(m).toEqual(["orderDate", "customerName", "productCode", "barcode", "productName", "qty", "unit", "unitPrice", "assignee", "memo", "note", "shipDate"]);
  });
  it("베트남 시트 헤더 (상품명/규격 분리, 단가($), 개별항목)", () => {
    const m = guessMapping(["날짜", "코드", "상품명", "규격", "수량", "단위", "단가($)", "코팅", "헬릭스", "발주자/업체", "담당자", "일정 / 진행상황", "비고", "발송날짜"]);
    expect(m.slice(0, 10)).toEqual(["orderDate", "productCode", "productName", "spec", "qty", "unit", "unitPrice", "attr:코팅", "attr:헬릭스", "customerName"]);
  });
  it("시트 역할", () => {
    expect(sheetRole("외화 단가 계산")).toBe("skip");
    expect(sheetRole("업체 정보")).toBe("customers");
    expect(sheetRole("MRO잡자재")).toBe("orders");
  });
});

describe("날짜", () => {
  it("여러 형식", () => {
    expect(parseDate(new Date(Date.UTC(2026, 0, 8)), 2026).value).toBe("2026-01-08");
    expect(parseDate(46162, 2026).value).toBe("2026-05-20");
    expect(parseDate("26.06.10", 2026).value).toBe("2026-06-10");
    expect(parseDate("2026.06.11", 2026).value).toBe("2026-06-11");
    expect(parseDate("2026년 6/9", 2026).value).toBe("2026-06-09");
    expect(parseDate("6/11", 2026).value).toBe("2026-06-11");
  });
  it("잘못된 값은 오류", () => {
    expect(parseDate("046-065", 2026).error).toBeTruthy();
    expect(parseDate("7/360", 2026).error).toBeTruthy();
    expect(parseDate("rn", 2026).error).toBeTruthy();
    expect(parseDate("8개로 마감", 2026).error).toBeTruthy();
  });
});

describe("수량·단가", () => {
  it("수량", () => {
    expect(parseQty(5).value).toBe(5);
    expect(parseQty(-40).error).toMatch(/반품/);
    expect(parseQty("000-030").error).toBeTruthy();
    expect(parseQty(null).value).toBeNull();
  });
  it("빈 단가와 0원을 구분", () => {
    expect(parsePrice(null, "KRW").value).toBeNull();
    expect(parsePrice(0, "KRW").value).toBe(0);
    expect(parsePrice("무상샘플", "KRW").value).toBe(0);
    expect(parsePrice("교환", "KRW").value).toBeNull();
    expect(parsePrice("교환", "KRW").note).toBe("교환");
    expect(parsePrice("=ROUNDUP((I639*0.45),-1)", "KRW").value).toBeNull();
  });
  it("달러 문자열", () => {
    const p = parsePrice("$ 7.10", "KRW");
    expect(p.value).toBe(7.1);
    expect(p.currency).toBe("USD");
  });
});

describe("거래처·품번", () => {
  it("괄호 안 주문경로", () => {
    expect(splitCustomer("홍길동(네이버페이)")).toMatchObject({ name: "홍길동", channel: "NAVERPAY" });
    expect(splitCustomer("제이엠인더스트리(자사몰)")).toMatchObject({ name: "제이엠인더스트리", channel: "OWNMALL" });
    expect(splitCustomer("아이마켓(진양오일씰)")).toMatchObject({ name: "진양오일씰", channel: "IMARKET" });
    expect(splitCustomer("진양오일씰(아이마켓)")).toMatchObject({ name: "진양오일씰", channel: "IMARKET" });
    expect(splitCustomer("MRO 재고").channel).toBe("INTERNAL");
    expect(splitCustomer("툴탑").channel).toBe("DIRECT");
  });
  it("베트남 발주자/업체", () => {
    expect(splitRequester("HAI/KISHIN")).toEqual({ requester: "HAI", customer: "KISHIN" });
    expect(splitRequester("KISHIN")).toEqual({ customer: "KISHIN" });
  });
  it("중복 판정 이름", () => {
    expect(normalizeName("(주)성심기기센터")).toBe(normalizeName("성심기기센터"));
    expect(normalizeName("MRO 재고")).toBe(normalizeName("MRO재고"));
  });
  it("품번 정리", () => {
    expect(normalizeCode("KW100231\n").value).toBe("KW100231");
    expect(normalizeCode("kW100230").value).toBe("KW100230");
    expect(normalizeCode(100883).warn).toMatch(/KW/);
    expect(normalizeCode('=IFERROR(__xludf.DUMMYFUNCTION("AI(…)"),"")').value).toBeNull();
  });
});

describe("메모 속 납품 기록", () => {
  it("여러 건 추출", () => {
    const r = extractDeliveries("1/19 30개발송 / 1/23 48개 발송", 2026);
    expect(r).toEqual([
      { date: "2026-01-19", qty: 30, raw: "1/19 30개발송" },
      { date: "2026-01-23", qty: 48, raw: "1/23 48개 발송" },
    ]);
    expect(extractDeliveries("72개중 2/11 30개 발송", 2026)[0].qty).toBe(30);
    expect(extractDeliveries("하루일정으로 만들어주세요", 2026)).toEqual([]);
  });
});
