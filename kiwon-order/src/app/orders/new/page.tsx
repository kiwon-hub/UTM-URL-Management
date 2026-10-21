"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { addDays, lineAmount, todayStr } from "@/lib/calc";
import { normalizeName } from "@/lib/excel/normalize";
import { CHANNELS } from "@/lib/status";
import { useData } from "@/lib/store";
import type { ChannelCode, Currency, Customer, OrderTypeCode } from "@/lib/types";

export default function NewOrderPage() {
  return (
    <Suspense>
      <NewOrder />
    </Suspense>
  );
}

interface Line {
  key: number;
  productCode: string;
  barcode: string;
  productName: string;
  spec: string;
  qty: string;
  unit: string;
  unitPrice: string; // 빈칸 = 미입력(null), "0" = 0원
  currency: Currency;
  assigneeId: string;
  dueDate: string;
  memo: string;
}
const FIELDS = ["productCode", "productName", "spec", "qty", "unit", "unitPrice", "dueDate", "memo"] as const;
let seq = 1;
const emptyLine = (currency: Currency = "KRW"): Line => ({ key: seq++, productCode: "", barcode: "", productName: "", spec: "", qty: "", unit: "EA", unitPrice: "", currency, assigneeId: "", dueDate: "", memo: "" });

function NewOrder() {
  const { db, me, can, createOrder, upsertCustomer } = useData();
  const router = useRouter();
  const params = useSearchParams();
  const copyId = params.get("copy");

  const [orderType, setOrderType] = useState<OrderTypeCode>("GENERAL");
  const [saving, setSaving] = useState(false);
  const [orderDate, setOrderDate] = useState(todayStr());
  const [customerText, setCustomerText] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [channel, setChannel] = useState<ChannelCode>("DIRECT");
  const [requester, setRequester] = useState("");
  const [assigneeId, setAssigneeId] = useState(me.role === "STAFF" ? me.id : "");
  const [dueDate, setDueDate] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [keepGoing, setKeepGoing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [custOpen, setCustOpen] = useState(false);
  const gridRef = useRef<HTMLTableSectionElement>(null);
  const custRef = useRef<HTMLInputElement>(null);

  // 기존 발주 복사
  useEffect(() => {
    if (!copyId) return;
    const o = db.orders.find((x) => x.id === copyId);
    if (!o) return;
    setOrderType(o.orderType);
    setCustomerText(o.customerName);
    setCustomer(db.customers.find((c) => c.id === o.customerId) ?? null);
    setChannel(o.channel);
    setRequester(o.requester ?? "");
    setCustomerText(o.customerName);
    setAssigneeId(o.assigneeId ?? "");
    setMemo(o.memo ?? "");
    setLines(
      db.items
        .filter((i) => i.orderId === o.id)
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((i) => ({ ...emptyLine(i.currency), productCode: i.productCode ?? "", barcode: i.barcode ?? "", productName: i.productName, spec: i.spec ?? "", qty: String(i.qty), unit: i.unit ?? "", unitPrice: i.unitPrice === null ? "" : String(i.unitPrice), assigneeId: i.assigneeId ?? "", memo: "" })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyId]);

  const defaultCurrency: Currency = orderType === "VIETNAM" ? "USD" : "KRW";

  const custMatches = useMemo(() => {
    const q = normalizeName(customerText);
    if (!q) return db.customers.slice(0, 8);
    return db.customers.filter((c) => c.normalizedName.includes(q) || c.aliases.some((a) => normalizeName(a).includes(q))).slice(0, 8);
  }, [customerText, db.customers]);
  const exact = db.customers.find((c) => c.normalizedName === normalizeName(customerText) || c.aliases.some((a) => normalizeName(a) === normalizeName(customerText)));

  // 품번 자동완성 원천: 상품 마스터 + 과거 발주 품목 (최근 단가 포함)
  const catalog = useMemo(() => {
    const m = new Map<string, { code: string; name: string; spec: string; unit: string; price: number | null; currency: Currency; last?: string }>();
    for (const p of db.products) m.set(p.code, { code: p.code, name: p.name, spec: p.spec ?? "", unit: p.unit ?? "EA", price: p.lastPrice ?? null, currency: p.currency });
    const orders = new Map(db.orders.map((o) => [o.id, o]));
    for (const i of [...db.items].sort((a, b) => (orders.get(a.orderId)?.orderDate ?? "").localeCompare(orders.get(b.orderId)?.orderDate ?? ""))) {
      if (!i.productCode) continue;
      const o = orders.get(i.orderId);
      // 무상(0원)·미입력 단가는 '최근 단가'로 쓰지 않음
      const prev = m.get(i.productCode)?.price ?? null;
      const price = i.unitPrice !== null && i.unitPrice > 0 ? i.unitPrice : prev;
      m.set(i.productCode, { code: i.productCode, name: i.productName, spec: i.spec ?? "", unit: i.unit ?? "EA", price, currency: i.currency, last: o ? `${o.orderDate} ${o.customerName}` : undefined });
    }
    return [...m.values()];
  }, [db.products, db.items, db.orders]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const fillFromCode = (key: number, code: string) => {
    const hit = catalog.find((c) => c.code.toLowerCase() === code.trim().toLowerCase());
    if (hit) update(key, { productCode: hit.code, productName: hit.name, spec: hit.spec, unit: hit.unit, unitPrice: hit.price === null ? "" : String(hit.price), currency: hit.currency });
  };

  const pickCustomer = (c: Customer) => {
    setCustomer(c);
    setCustomerText(c.name);
    setCustOpen(false);
    if (c.kind === "INTERNAL") setChannel("INTERNAL");
    else if (c.kind === "ONLINE_PERSON") setChannel("NAVERPAY");
    else setChannel("DIRECT");
  };

  // Enter = 다음 칸, 마지막 칸에서 Enter = 새 품목 행, Ctrl+Enter = 저장
  const onGridKey = (e: KeyboardEvent<HTMLInputElement>, row: number, field: (typeof FIELDS)[number]) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (field === "productCode") fillFromCode(lines[row].key, (e.target as HTMLInputElement).value);
    const col = FIELDS.indexOf(field);
    if (col < FIELDS.length - 1) focusCell(row, FIELDS[col + 1]);
    else {
      if (row === lines.length - 1) setLines((ls) => [...ls, emptyLine(defaultCurrency)]);
      setTimeout(() => focusCell(row + 1, "productCode"), 0);
    }
  };
  const focusCell = (row: number, field: string) => gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${row}-${field}"]`)?.focus();

  const total = lines.reduce(
    (acc, l) => {
      const a = lineAmount(Number(l.qty) || 0, l.unitPrice === "" ? null : Number(l.unitPrice));
      if (a !== null) acc[l.currency] = (acc[l.currency] ?? 0) + a;
      return acc;
    },
    {} as Record<string, number>,
  );

  async function save() {
    if (saving) return;
    setError(null);
    if (!dueDate) {
      setError("요청 납기일을 입력하세요. (정확하지 않아도 예상일을 적어두면 임박 알림을 받을 수 있습니다)");
      return;
    }
    let custId = customer?.id ?? exact?.id ?? null;
    if (!custId && customerText.trim()) {
      if (!confirm(`'${customerText}'은(는) 등록되지 않은 거래처입니다. 새 거래처로 등록할까요?`)) return;
      const c = await upsertCustomer({ name: customerText.trim(), kind: "B2B" });
      if ("error" in c) return setError(c.error);
      custId = c.id;
    }
    setSaving(true);
    const r = await createOrder({
      orderDate,
      orderType,
      customerId: custId,
      customerName: customerText.trim(),
      channel,
      requester: requester || undefined,
      assigneeId: assigneeId || undefined,
      dueDate: dueDate || undefined,
      memo: memo || undefined,
      items: lines
        .filter((l) => l.productName.trim() || l.productCode.trim())
        .map((l) => ({
          productCode: l.productCode.trim() || undefined,
          barcode: l.barcode.trim() || undefined,
          productName: l.productName.trim() || l.productCode.trim(),
          spec: l.spec.trim() || undefined,
          qty: Number(l.qty),
          cancelledQty: 0,
          unit: l.unit.trim() || undefined,
          unitPrice: l.unitPrice.trim() === "" ? null : Number(l.unitPrice.replace(/,/g, "")),
          currency: l.currency,
          assigneeId: l.assigneeId || undefined,
          dueDate: l.dueDate || undefined,
          memo: l.memo.trim() || undefined,
        })),
    });
    setSaving(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    if (keepGoing) {
      setSaved(r.orderNo);
      setLines([emptyLine(defaultCurrency)]);
      setCustomer(null);
      setCustomerText("");
      setMemo("");
      custRef.current?.focus();
    } else router.push(`/orders?q=${encodeURIComponent(r.orderNo)}`);
  }

  if (!can("create")) return <p className="card p-6">조회 전용 사용자는 발주를 등록할 수 없습니다. 관리자에게 권한을 요청하세요.</p>;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); save(); }}
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (e.key !== "Enter" || e.defaultPrevented) return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); save(); return; }
        if (t.tagName === "BUTTON") return;
        e.preventDefault();
        // 상단 입력칸에서 Enter = 다음 칸으로 이동 (실수로 저장되지 않도록)
        const all = [...e.currentTarget.querySelectorAll<HTMLElement>("input:not([disabled]):not([type=checkbox]), select")];
        all[all.indexOf(t) + 1]?.focus();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">신규 발주 등록</h1>
        {copyId && <span className="rounded bg-violet-50 px-2 py-0.5 text-[12px] text-violet-800">⧉ 기존 발주를 복사했습니다 — 수량·납기를 확인하세요</span>}
        <span className="text-[12px] text-slate-500">발주번호는 저장할 때 자동 생성됩니다 · Enter: 다음 칸 · 마지막 칸 Enter: 품목 추가 · Ctrl+Enter: 저장</span>
      </div>
      {saved && <div className="rounded bg-emerald-50 px-3 py-2 text-emerald-800">✔ {saved} 저장 완료. 다음 발주를 입력하세요.</div>}
      {error && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">⚠ {error}</div>}

      <section className="card grid grid-cols-2 gap-3 p-3 md:grid-cols-4 xl:grid-cols-8">
        <label>
          <span className="lbl">발주일 *</span>
          <input type="date" className="inp w-full" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
        </label>
        <div className="relative col-span-2 md:col-span-3 xl:col-span-3">
          <span className="lbl">거래처 * <span className="font-normal text-slate-400">(검색 후 선택)</span></span>
          <input
            ref={custRef}
            autoFocus
            className="inp w-full"
            value={customerText}
            placeholder="거래처명 입력"
            onChange={(e) => { setCustomerText(e.target.value); setCustomer(null); setCustOpen(true); }}
            onFocus={() => setCustOpen(true)}
            onBlur={() => setTimeout(() => setCustOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter" && custMatches[0] && custOpen) { e.preventDefault(); pickCustomer(custMatches[0]); } }}
            role="combobox"
            aria-expanded={custOpen}
            required
          />
          {custOpen && custMatches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded border border-slate-300 bg-white shadow-lg" role="listbox">
              {custMatches.map((c) => (
                <li key={c.id} role="option" aria-selected={false} className="cursor-pointer px-2 py-1.5 hover:bg-blue-50" onMouseDown={() => pickCustomer(c)}>
                  <b>{c.name}</b> <span className="text-[11px] text-slate-500">{c.shippingMethod ?? ""} {c.shippingBranch ?? ""}</span>
                </li>
              ))}
            </ul>
          )}
          {!customer && customerText && !exact && <p className="mt-1 text-[11px] text-amber-700">◔ 등록되지 않은 거래처 — 저장 시 새 거래처로 등록합니다 (중복 확인됨)</p>}
          {!customer && exact && <p className="mt-1 text-[11px] text-blue-700">같은 거래처가 이미 있습니다: <button type="button" className="underline" onClick={() => pickCustomer(exact)}>{exact.name} 선택</button></p>}
        </div>
        <label>
          <span className="lbl">주문경로</span>
          <select className="inp w-full" value={channel} onChange={(e) => setChannel(e.target.value as ChannelCode)}>
            {CHANNELS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label>
          <span className="lbl">담당자</span>
          <select className="inp w-full" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">(미지정)</option>
            {db.users.filter((u) => u.role !== "VIEWER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <div className="col-span-2">
          <span className="lbl">요청 납기일 * <span className="font-normal text-slate-400">(예상일도 OK — 임박 시 알림)</span></span>
          <div className="flex gap-1">
            <input type="date" className={`inp min-w-0 flex-1 ${!dueDate ? "border-amber-400" : ""}`} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required aria-label="요청 납기일" />
            {[3, 7, 14].map((d) => (
              <button key={d} type="button" tabIndex={-1} className="btn px-2" onClick={() => setDueDate(addDays(orderDate, d))}>+{d}일</button>
            ))}
          </div>
        </div>
        {customer && (customer.shippingMethod || customer.shippingBranch || customer.contact || customer.memo) && (
          <div className="col-span-2 rounded bg-slate-50 p-2 text-[12px] text-slate-700 md:col-span-4 xl:col-span-8">
            <b>거래처 정보 자동 입력:</b> 배송 {customer.shippingMethod ?? "-"} · 지점 {customer.shippingBranch ?? "-"} · 연락처 {customer.contact ?? "-"} {customer.memo && <span className="text-amber-800">· 메모: {customer.memo}</span>}
          </div>
        )}
        <label>
          <span className="lbl">발주자/요청자</span>
          <input className="inp w-full" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="예: HAI" />
        </label>
        <label className="col-span-1 md:col-span-3 xl:col-span-5">
          <span className="lbl">비고</span>
          <input className="inp w-full" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <label className="col-span-2">
          <span className="lbl">첨부파일 <span className="font-normal text-slate-400">(2차 개발)</span></span>
          <input type="file" className="inp w-full py-1" disabled />
        </label>
      </section>

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="font-semibold">품목 ({lines.filter((l) => l.productName || l.productCode).length})</h2>
          <button type="button" className="btn" onClick={() => setLines([...lines, emptyLine(defaultCurrency)])}>＋ 품목 행 추가</button>
        </div>
        <div className="overflow-x-auto">
          <datalist id="codes">
            {catalog.map((c) => <option key={c.code} value={c.code}>{c.name} {c.spec}</option>)}
          </datalist>
          <table className="w-full min-w-[1500px] table-fixed text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600">
              <tr>
                <th className="w-8 px-2 py-1.5">#</th>
                <th className="w-32 text-left">품번</th>
                <th className="w-56 text-left">상품명 *</th>
                <th className="w-48 text-left">규격</th>
                <th className="w-20 pr-2 text-right">수량 *</th>
                <th className="w-16 text-left">단위</th>
                <th className="w-24 pr-2 text-right">단가</th>
                <th className="w-20 text-left">통화</th>
                <th className="w-28 pr-2 text-right">금액</th>
                <th className="w-28 text-left">품목담당</th>
                <th className="w-36 text-left">품목납기</th>
                <th className="w-48 text-left">제작·입고 메모</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody ref={gridRef}>
              {lines.map((l, row) => {
                const amount = lineAmount(Number(l.qty) || 0, l.unitPrice === "" ? null : Number(l.unitPrice));
                const hint = catalog.find((c) => c.code === l.productCode);
                const inp = (field: (typeof FIELDS)[number], extra: Record<string, unknown> = {}) => ({
                  "data-cell": `${row}-${field}`,
                  className: `inp w-full ${extra.className ?? ""}`,
                  value: l[field],
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => update(l.key, { [field]: e.target.value } as Partial<Line>),
                  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => onGridKey(e, row, field),
                  "aria-label": `${row + 1}행 ${field}`,
                });
                return (
                  <tr key={l.key} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-1 text-center text-slate-400">{row + 1}</td>
                    <td className="py-1 pr-1">
                      <input {...inp("productCode")} list="codes" onBlur={(e) => fillFromCode(l.key, e.target.value)} placeholder="KW…" />
                      {hint?.last && <div className="mt-0.5 truncate text-[10px] text-slate-400" title={hint.last}>최근: {hint.last}</div>}
                    </td>
                    <td className="py-1 pr-1"><input {...inp("productName")} /></td>
                    <td className="py-1 pr-1"><input {...inp("spec")} /></td>
                    <td className="py-1 pr-1"><input {...inp("qty", { className: "text-right" })} inputMode="decimal" /></td>
                    <td className="py-1 pr-1"><input {...inp("unit")} /></td>
                    <td className="py-1 pr-1"><input {...inp("unitPrice", { className: "text-right" })} inputMode="decimal" placeholder="미입력" title="비워두면 '단가 미입력', 0을 입력하면 0원(무상)" /></td>
                    <td className="py-1 pr-1">
                      <select className="inp w-full" value={l.currency} onChange={(e) => update(l.key, { currency: e.target.value as Currency })} tabIndex={-1}>
                        {(["KRW", "USD", "CNY", "VND", "THB"] as Currency[]).map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-2 pt-2 text-right tabular-nums">{amount === null ? <span className="text-slate-400">—</span> : amount.toLocaleString()}</td>
                    <td className="py-1 pr-1">
                      <select className="inp w-full" value={l.assigneeId} onChange={(e) => update(l.key, { assigneeId: e.target.value })} tabIndex={-1}>
                        <option value="">(발주와 동일)</option>
                        {db.users.filter((u) => u.role !== "VIEWER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td className="py-1 pr-1"><input {...inp("dueDate")} type="date" /></td>
                    <td className="py-1 pr-1"><input {...inp("memo")} placeholder="예: 하루일정으로 제작요청" /></td>
                    <td className="py-1 text-center">
                      <button type="button" className="text-slate-400 hover:text-red-600" tabIndex={-1} aria-label={`${row + 1}행 삭제`} onClick={() => setLines(lines.length > 1 ? lines.filter((x) => x.key !== l.key) : [emptyLine(defaultCurrency)])}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-300 bg-slate-50">
              <tr>
                <td colSpan={8} className="px-2 py-1.5 text-right font-semibold">합계</td>
                <td className="pr-2 text-right font-semibold tabular-nums" colSpan={1}>
                  {Object.entries(total).map(([cur, v]) => <div key={cur}>{cur === "KRW" ? v.toLocaleString() + "원" : `${cur} ${v.toLocaleString()}`}</div>)}
                </td>
                <td colSpan={4} className="px-2 text-[11px] text-slate-500">단가 미입력 품목은 합계에서 제외</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur">
        <label className="inline-flex items-center gap-1 text-[13px]">
          <input type="checkbox" checked={keepGoing} onChange={(e) => setKeepGoing(e.target.checked)} /> 저장 후 계속 입력
        </label>
        <button type="button" className="btn ml-auto" onClick={() => router.back()}>취소</button>
        <button type="submit" className="btn-primary px-6" disabled={saving}>{saving ? "저장 중…" : "저장 (Ctrl+Enter)"}</button>
      </div>
    </form>
  );
}
