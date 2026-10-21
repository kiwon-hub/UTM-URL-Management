"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { normalizeName } from "@/lib/excel/normalize";
import { filtersToQuery } from "@/lib/filters";
import { useData } from "@/lib/store";
import type { Customer } from "@/lib/types";

const KIND = { B2B: "기업", ONLINE_PERSON: "온라인 개인", INTERNAL: "자사 재고", OVERSEAS: "해외" } as const;

export default function CustomersPage() {
  const { db, rows, can, upsertCustomer } = useData();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const stats = useMemo(() => {
    const m = new Map<string, { orders: Set<string>; remain: number; last: string }>();
    for (const r of rows) {
      const key = r.order.customerId ?? normalizeName(r.order.customerName);
      const e = m.get(key) ?? { orders: new Set(), remain: 0, last: "" };
      e.orders.add(r.order.id);
      if (r.effectiveStatus !== "CANCELLED") e.remain += r.remaining;
      if (r.order.orderDate > e.last) e.last = r.order.orderDate;
      m.set(key, e);
    }
    return m;
  }, [rows]);
  const list = db.customers.filter((c) => !q || c.normalizedName.includes(normalizeName(q)) || c.aliases.some((a) => a.includes(q)));
  const dup = edit?.name ? db.customers.find((c) => c.id !== edit.id && c.normalizedName === normalizeName(edit.name!)) : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">거래처</h1>
        <input className="inp w-60" placeholder="거래처 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="text-[12px] text-slate-500">2차 개발에서 고도화 (기본 기능 시안)</span>
        {can("create") && <button className="btn-primary ml-auto" onClick={() => setEdit({ kind: "B2B", aliases: [] })}>＋ 거래처 등록</button>}
      </div>
      {edit && (
        <div className="card grid gap-2 p-3 md:grid-cols-4">
          <label><span className="lbl">거래처명 *</span><input className="inp w-full" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <label><span className="lbl">구분</span><select className="inp w-full" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Customer["kind"] })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className="lbl">담당자/연락처</span><input className="inp w-full" value={edit.contact ?? ""} onChange={(e) => setEdit({ ...edit, contact: e.target.value })} /></label>
          <label><span className="lbl">배송방법</span><input className="inp w-full" value={edit.shippingMethod ?? ""} onChange={(e) => setEdit({ ...edit, shippingMethod: e.target.value })} /></label>
          <label><span className="lbl">배송지/화물지점</span><input className="inp w-full" value={edit.shippingBranch ?? ""} onChange={(e) => setEdit({ ...edit, shippingBranch: e.target.value })} /></label>
          <label className="md:col-span-2"><span className="lbl">메모</span><input className="inp w-full" value={edit.memo ?? ""} onChange={(e) => setEdit({ ...edit, memo: e.target.value })} /></label>
          <div className="flex items-end gap-1">
            <button className="btn-primary" disabled={!edit.name?.trim() || !!dup} onClick={() => { upsertCustomer({ ...(edit as Customer), name: edit.name!.trim(), aliases: edit.aliases ?? [] }); setEdit(null); }}>저장</button>
            <button className="btn" onClick={() => setEdit(null)}>취소</button>
          </div>
          {dup && <p className="text-[12px] text-red-700 md:col-span-4">⚠ 같은 거래처가 이미 있습니다: {dup.name} (공백·(주)·대소문자 무시 비교)</p>}
        </div>
      )}
      <div className="grid-wrap">
        <table className="grid-table">
          <thead><tr><th>거래처명</th><th>구분</th><th>담당자/연락처</th><th>배송방법</th><th>배송지/화물지점</th><th>메모</th><th className="text-right">발주</th><th className="text-right">미납수량</th><th>최근 발주</th><th /></tr></thead>
          <tbody>
            {list.map((c) => {
              const s = stats.get(c.id) ?? stats.get(c.normalizedName);
              return (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}{c.aliases.length > 0 && <span className="ml-1 text-[11px] text-slate-400">({c.aliases.join(", ")})</span>}</td>
                  <td>{KIND[c.kind]}</td><td>{c.contact}</td><td>{c.shippingMethod}</td><td>{c.shippingBranch}</td><td className="max-w-[220px] truncate" title={c.memo}>{c.memo}</td>
                  <td className="text-right">{s?.orders.size ?? 0}</td><td className="text-right">{s?.remain ? <b className="text-amber-800">{s.remain}</b> : 0}</td><td>{s?.last}</td>
                  <td className="space-x-2"><Link className="text-blue-700 underline" href={`/orders${filtersToQuery({ customer: c.name })}`}>발주내역</Link>{can("create") && <button className="text-slate-600 underline" onClick={() => setEdit(c)}>수정</button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
