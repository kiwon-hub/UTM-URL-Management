"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, todayStr } from "@/lib/calc";
import { applyFilters, filtersToQuery, matchPreset, PRESET_LABEL, type Filters, type Preset } from "@/lib/filters";
import { STATUSES } from "@/lib/status";
import { useData, userName } from "@/lib/store";
import { Flag, StatusBadge } from "@/components/StatusBadge";
import type { ItemRow } from "@/lib/types";

const CARDS: { p: Preset; icon: string; tone: string }[] = [
  { p: "today", icon: "✚", tone: "text-blue-700" },
  { p: "open", icon: "▶", tone: "text-slate-800" },
  { p: "received", icon: "◆", tone: "text-blue-800" },
  { p: "production", icon: "⚙", tone: "text-violet-800" },
  { p: "soon", icon: "◷", tone: "text-orange-700" },
  { p: "overdue", icon: "▲", tone: "text-red-700" },
  { p: "partial", icon: "◐", tone: "text-amber-800" },
  { p: "remain", icon: "◔", tone: "text-amber-900" },
  { p: "delivered", icon: "✔", tone: "text-emerald-700" },
];

export default function Dashboard() {
  const { db, rows, me } = useData();
  const [scope, setScope] = useState<"all" | "me">(me.role === "STAFF" ? "me" : "all");
  const [f, setF] = useState<Filters>({ from: addDays(todayStr(), -60) });
  const un = (id?: string | null) => userName(db, id);

  const base = useMemo(() => {
    const ff: Filters = { ...f, assignee: scope === "me" ? me.id : f.assignee };
    return applyFilters(rows, ff, un);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f, scope, me.id]);

  const listFilter = (p: Preset): string => filtersToQuery({ ...f, assignee: scope === "me" ? me.id : f.assignee, preset: p });

  const count = (p: Preset) => {
    const hit = base.filter((r) => matchPreset(r, p));
    return { orders: new Set(hit.map((r) => r.order.id)).size, items: hit.length };
  };

  // 오늘 처리할 일: 지연 → 오늘/임박 납기 → 오늘 신규
  const todo = useMemo(() => {
    const t = todayStr();
    const pr = (r: ItemRow) => (r.overdue ? 0 : (r.item.dueDate ?? r.order.dueDate) === t ? 1 : r.dueSoon ? 2 : r.order.orderDate === t ? 3 : 9);
    return base.filter((r) => pr(r) < 9).sort((a, b) => pr(a) - pr(b) || (a.item.dueDate ?? a.order.dueDate ?? "").localeCompare(b.item.dueDate ?? b.order.dueDate ?? "")).slice(0, 12);
  }, [base]);

  // 담당자별 현황 (품목 담당자 우선, 없으면 발주 담당자)
  const byUser = useMemo(() => {
    const m = new Map<string, { open: number; overdue: number; soon: number; remainQty: number; byStatus: Record<string, number> }>();
    for (const r of applyFilters(rows, f, un)) {
      const id = r.item.assigneeId ?? r.order.assigneeId ?? "-";
      const e = m.get(id) ?? { open: 0, overdue: 0, soon: 0, remainQty: 0, byStatus: {} };
      if (matchPreset(r, "open")) e.open++;
      if (r.overdue) e.overdue++;
      if (r.dueSoon) e.soon++;
      if (matchPreset(r, "remain")) e.remainQty += r.remaining;
      e.byStatus[r.effectiveStatus] = (e.byStatus[r.effectiveStatus] ?? 0) + 1;
      m.set(id, e);
    }
    return [...m.entries()].sort((a, b) => b[1].open - a[1].open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f]);

  // 미납 남은 거래처
  const byCustomer = useMemo(() => {
    const m = new Map<string, { items: number; qty: number; overdue: number }>();
    for (const r of base) {
      if (!matchPreset(r, "remain")) continue;
      const e = m.get(r.order.customerName) ?? { items: 0, qty: 0, overdue: 0 };
      e.items++;
      e.qty += r.remaining;
      if (r.overdue) e.overdue++;
      m.set(r.order.customerName, e);
    }
    return [...m.entries()].sort((a, b) => b[1].overdue - a[1].overdue || b[1].items - a[1].items).slice(0, 8);
  }, [base]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <h1 className="mr-2 text-lg font-bold">대시보드</h1>
        <div className="inline-flex overflow-hidden rounded border border-slate-300" role="tablist">
          {(["all", "me"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={`h-8 px-3 text-[13px] ${scope === s ? "bg-blue-600 font-semibold text-white" : "bg-white text-slate-700"}`}>
              {s === "all" ? "전체 업무" : `내 업무 (${me.name})`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="lbl">발주일</span>
            <span className="flex items-center gap-1">
              <input type="date" className="inp" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} />~
              <input type="date" className="inp" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </span>
          </label>
          {scope === "all" && (
            <label>
              <span className="lbl">담당자</span>
              <select className="inp" value={f.assignee ?? ""} onChange={(e) => setF({ ...f, assignee: e.target.value })}>
                <option value="">전체</option>
                {db.users.filter((u) => u.role !== "VIEWER").map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="lbl">거래처</span>
            <input className="inp w-32" placeholder="거래처명" value={f.customer ?? ""} onChange={(e) => setF({ ...f, customer: e.target.value })} />
          </label>
        </div>
        <Link href="/orders/new" className="btn-primary ml-auto">＋ 신규 발주 등록</Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {CARDS.map(({ p, icon, tone }) => {
          const c = count(p);
          return (
            <Link key={p} href={`/orders${listFilter(p)}`} className="card block p-3 hover:border-blue-400 hover:shadow-sm">
              <div className="flex items-center gap-1 text-[12px] text-slate-600">
                <span aria-hidden className={tone}>{icon}</span>
                {PRESET_LABEL[p]}
              </div>
              <div className={`mt-1 text-2xl font-bold ${tone}`}>
                {c.orders}
                <span className="ml-0.5 text-[12px] font-normal text-slate-500">건</span>
              </div>
              <div className="text-[11px] text-slate-500">품목 {c.items}개</div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
            <h2 className="font-semibold">오늘 처리할 일</h2>
            <Link className="text-[12px] text-blue-700 hover:underline" href={`/orders${listFilter("overdue")}`}>지연 전체 보기 →</Link>
          </div>
          {todo.length === 0 ? (
            <p className="p-6 text-center text-slate-500">처리할 항목이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {todo.map((r) => (
                <li key={r.item.id}>
                  <Link href={`/orders?q=${encodeURIComponent(r.order.orderNo)}&sel=${r.item.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-slate-50">
                    {r.overdue ? <Flag kind="overdue" /> : r.dueSoon ? <Flag kind="soon" /> : <span className="rounded bg-blue-50 px-1 text-[11px] text-blue-800 ring-1 ring-blue-200 ring-inset">✚ 신규</span>}
                    <span className="font-mono text-[12px] text-slate-500">{r.order.orderNo}</span>
                    <span className="font-medium">{r.order.customerName}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{r.item.productName} {r.item.spec}</span>
                    <StatusBadge code={r.effectiveStatus} small />
                    <span className="text-[12px] text-slate-500">미납 {r.remaining}</span>
                    <span className="text-[12px] text-slate-500">납기 {r.item.dueDate ?? r.order.dueDate ?? "-"}</span>
                    <span className="text-[12px] text-slate-600">{un(r.item.assigneeId ?? r.order.assigneeId)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card lg:col-span-2">
          <div className="border-b border-slate-200 px-3 py-2">
            <h2 className="font-semibold">미납이 남은 거래처</h2>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600">
              <tr>
                <th className="px-3 py-1.5 text-left">거래처</th>
                <th className="px-2 text-right">품목</th>
                <th className="px-2 text-right">미납수량</th>
                <th className="px-3 text-right">지연</th>
              </tr>
            </thead>
            <tbody>
              {byCustomer.map(([name, e]) => (
                <tr key={name} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5">
                    <Link className="hover:underline" href={`/orders${filtersToQuery({ customer: name, preset: "remain" })}`}>{name}</Link>
                  </td>
                  <td className="px-2 text-right">{e.items}</td>
                  <td className="px-2 text-right">{e.qty.toLocaleString()}</td>
                  <td className="px-3 text-right">{e.overdue ? <span className="font-semibold text-red-700">▲ {e.overdue}</span> : "-"}</td>
                </tr>
              ))}
              {!byCustomer.length && (
                <tr><td colSpan={4} className="p-4 text-center text-slate-500">미납 없음</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card">
        <div className="border-b border-slate-200 px-3 py-2">
          <h2 className="font-semibold">담당자별 업무현황 <span className="text-[12px] font-normal text-slate-500">(품목 기준, 품목 담당자 우선)</span></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600">
              <tr>
                <th className="px-3 py-1.5 text-left">담당자</th>
                <th className="px-2 text-right">진행 중</th>
                <th className="px-2 text-right">지연</th>
                <th className="px-2 text-right">임박</th>
                <th className="px-2 text-right">미납수량</th>
                {STATUSES.map((s) => (
                  <th key={s.code} className="px-2 text-right whitespace-nowrap">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byUser.map(([id, e]) => (
                <tr key={id} className={`border-t border-slate-100 hover:bg-slate-50 ${id === me.id ? "bg-blue-50/40" : ""}`}>
                  <td className="px-3 py-1.5 font-medium">
                    <Link className="hover:underline" href={`/orders${filtersToQuery({ assignee: id, preset: "open" })}`}>{id === "-" ? "(미지정)" : un(id)}</Link>
                  </td>
                  <td className="px-2 text-right font-semibold">{e.open}</td>
                  <td className="px-2 text-right">{e.overdue ? <span className="font-semibold text-red-700">▲ {e.overdue}</span> : "-"}</td>
                  <td className="px-2 text-right">{e.soon || "-"}</td>
                  <td className="px-2 text-right">{e.remainQty.toLocaleString()}</td>
                  {STATUSES.map((s) => (
                    <td key={s.code} className="px-2 text-right text-slate-600">{e.byStatus[s.code] ?? "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
