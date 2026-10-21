"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { COLUMNS, DEFAULT_COLUMNS, PINNED, type ColumnDef } from "@/lib/columns";
import { exportRows } from "@/lib/excel/export";
import { applyFilters, filtersFromParams, filtersToQuery, PRESET_LABEL, type Filters } from "@/lib/filters";
import { DIVISIONS, ORDER_TYPES, STATUSES } from "@/lib/status";
import { useData, userName } from "@/lib/store";
import type { ItemRow } from "@/lib/types";
import { DetailPanel } from "@/components/DetailPanel";
import { Flag, SourceTag, StatusBadge } from "@/components/StatusBadge";

export default function OrdersPage() {
  return (
    <Suspense>
      <OrderList />
    </Suspense>
  );
}

const PREF_KEY = (uid: string) => `kiwon-order-proto-v1:listpref:${uid}`;

function OrderList() {
  const { db, rows, me, saveView, deleteView } = useData();
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const f = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);
  const sel = params.get("sel");
  const setF = (nf: Filters & { sel?: string }) => router.replace(path + filtersToQuery(nf), { scroll: false });
  const un = (id?: string) => userName(db, id);

  // 직원별 표시 설정 (컬럼 순서·표시, 정렬, 페이지당 건수, 내 담당 먼저)
  const [cols, setCols] = useState<string[]>(DEFAULT_COLUMNS);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "orderDate", dir: "desc" });
  const [pageSize, setPageSize] = useState(50);
  const [mineFirst, setMineFirst] = useState(me.role === "STAFF");
  const [page, setPage] = useState(1);
  const [showCols, setShowCols] = useState(false);
  const [more, setMore] = useState(!!(f.customer || f.product || f.spec || f.code || f.dueFrom || f.dueTo));

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY(me.id)) ?? "null");
      if (p) {
        setCols(p.cols.filter((c: string) => COLUMNS.some((x) => x.key === c)));
        setSort(p.sort);
        setPageSize(p.pageSize);
        setMineFirst(p.mineFirst);
      } else {
        setCols(DEFAULT_COLUMNS);
        setMineFirst(me.role === "STAFF");
      }
    } catch {}
  }, [me.id, me.role]);
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY(me.id), JSON.stringify({ cols, sort, pageSize, mineFirst }));
    } catch {}
  }, [cols, sort, pageSize, mineFirst, me.id]);
  useEffect(() => setPage(1), [params, pageSize]);

  const filtered = useMemo(() => {
    const list = applyFilters(rows, f, un);
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[1];
    const mine = (r: ItemRow) => (mineFirst && (r.item.assigneeId ?? r.order.assigneeId) === me.id ? 0 : 1);
    return [...list].sort((a, b) => {
      const m = mine(a) - mine(b);
      if (m) return m;
      const va = col.value(a, un);
      const vb = col.value(b, un);
      // 빈 값은 항상 아래로
      if (va === null || va === "") return vb === null || vb === "" ? 0 : 1;
      if (vb === null || vb === "") return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "ko");
      return (sort.dir === "asc" ? c : -c) || a.order.orderNo.localeCompare(b.order.orderNo) || a.item.lineNo - b.item.lineNo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, f, sort, mineFirst, me.id]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const view = filtered.slice((page - 1) * pageSize, page * pageSize);
  const orderCount = new Set(filtered.map((r) => r.order.id)).size;
  const visible = cols.map((k) => COLUMNS.find((c) => c.key === k)!).filter(Boolean);
  // 고정 열: 앞쪽에 연속해서 위치한 PINNED 열만 고정
  const pinOffsets: Record<string, number> = {};
  let off = 0;
  for (const c of visible) {
    if (!PINNED.has(c.key)) break;
    pinOffsets[c.key] = off;
    off += c.width;
  }
  const lastPin = Object.keys(pinOffsets).pop();
  const myViews = db.savedViews.filter((v) => v.userId === me.id);
  const activeCount = Object.keys(f).filter((k) => k !== "sel" && (f as Record<string, string>)[k]).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">통합 발주목록</h1>
        {f.preset && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] text-blue-800 ring-1 ring-blue-200">
            {PRESET_LABEL[f.preset]}
            <button aria-label="조건 해제" onClick={() => setF({ ...f, preset: undefined })}>✕</button>
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <select
            className="inp"
            value=""
            aria-label="저장된 보기"
            onChange={(e) => {
              const v = myViews.find((x) => x.id === e.target.value);
              if (!v) return;
              setCols(v.columns);
              setPageSize(v.pageSize);
              if (v.sort) setSort(v.sort);
              setF(v.filters as Filters);
            }}
          >
            <option value="">★ 저장된 보기 ({myViews.length})</option>
            {myViews.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button className="btn" onClick={() => {
            const name = prompt("현재 필터와 컬럼 설정을 저장할 이름", "내 미납 건");
            if (name) saveView({ name, filters: f as Record<string, string>, columns: cols, pageSize, sort });
          }}>☆ 보기 저장</button>
          {myViews.length > 0 && (
            <button className="btn" onClick={() => {
              const name = prompt(`삭제할 보기 이름: ${myViews.map((v) => v.name).join(", ")}`);
              const v = myViews.find((x) => x.name === name);
              if (v) deleteView(v.id);
            }}>보기 삭제</button>
          )}
          <Link href="/orders/new" className="btn-primary">＋ 신규 발주 등록</Link>
        </div>
      </div>

      {/* 검색·필터: 화면 상단 */}
      <div className="card p-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1">
            <span className="lbl">통합검색</span>
            <input className="inp w-full" placeholder="거래처·상품명·규격·품번·바코드·발주번호" value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </label>
          <label>
            <span className="lbl">발주일</span>
            <span className="flex items-center gap-1">
              <input type="date" className="inp" value={f.from ?? ""} onChange={(e) => setF({ ...f, from: e.target.value })} />~
              <input type="date" className="inp" value={f.to ?? ""} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </span>
          </label>
          <Sel label="사업부" value={f.division} onChange={(v) => setF({ ...f, division: v })} options={DIVISIONS.map((d) => [d.code, d.label])} />
          <Sel label="발주구분" value={f.orderType} onChange={(v) => setF({ ...f, orderType: v })} options={ORDER_TYPES.map((d) => [d.code, d.label])} />
          <Sel label="담당자" value={f.assignee} onChange={(v) => setF({ ...f, assignee: v })} options={db.users.filter((u) => u.role !== "VIEWER").map((u) => [u.id, u.name])} />
          <Sel label="진행상태" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[...STATUSES.map((s) => [s.code, `${s.icon} ${s.label}`] as [string, string]), ["RECEIVED,CONFIRMED,IN_PRODUCTION,READY,PARTIAL", "▶ 진행 중 전체"]]} />
          <Sel label="미납" value={f.remain} onChange={(v) => setF({ ...f, remain: v as Filters["remain"] })} options={[["Y", "미납 있음"], ["N", "미납 없음"]]} />
          <Sel label="납기" value={f.overdue ? "overdue" : f.soon ? "soon" : ""} onChange={(v) => setF({ ...f, overdue: v === "overdue" ? "Y" : undefined, soon: v === "soon" ? "Y" : undefined })} options={[["overdue", "▲ 지연"], ["soon", "◷ 임박"]]} />
          <Sel label="등록출처" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={[["MANUAL", "직접입력"], ["EXCEL_DAILY", "엑셀업로드"], ["EXCEL_MIGRATION", "엑셀이관"]]} />
          <button className="btn" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "▲ 상세조건 닫기" : "▼ 상세조건"}</button>
          {activeCount > 0 && <button className="btn" onClick={() => setF({})}>↺ 초기화 ({activeCount})</button>}
        </div>
        {more && (
          <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2">
            <Txt label="업체명" value={f.customer} onChange={(v) => setF({ ...f, customer: v })} />
            <Txt label="상품명" value={f.product} onChange={(v) => setF({ ...f, product: v })} />
            <Txt label="규격" value={f.spec} onChange={(v) => setF({ ...f, spec: v })} />
            <Txt label="품번/바코드" value={f.code} onChange={(v) => setF({ ...f, code: v })} />
            <label>
              <span className="lbl">납기일</span>
              <span className="flex items-center gap-1">
                <input type="date" className="inp" value={f.dueFrom ?? ""} onChange={(e) => setF({ ...f, dueFrom: e.target.value })} />~
                <input type="date" className="inp" value={f.dueTo ?? ""} onChange={(e) => setF({ ...f, dueTo: e.target.value })} />
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span>
          <b className="text-[14px]">{orderCount.toLocaleString()}</b>건 발주 · 품목 <b>{filtered.length.toLocaleString()}</b>개
        </span>
        <label className="ml-2 inline-flex items-center gap-1">
          <input type="checkbox" checked={mineFirst} onChange={(e) => setMineFirst(e.target.checked)} /> 내 담당 먼저 보기
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div className="relative">
            <button className="btn" onClick={() => setShowCols(!showCols)} aria-expanded={showCols}>▥ 컬럼 설정</button>
            {showCols && <ColumnPicker cols={cols} setCols={setCols} onClose={() => setShowCols(false)} />}
          </div>
          <select className="inp" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="페이지당 건수">
            {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}개씩</option>)}
          </select>
          <button className="btn" onClick={() => exportRows(filtered, cols, un, `발주목록_필터결과_${new Date().toISOString().slice(0, 10)}.xlsx`)}>⇩ 필터 결과 엑셀</button>
          <button className="btn" onClick={() => exportRows(rows, cols, un, `발주목록_전체_${new Date().toISOString().slice(0, 10)}.xlsx`)}>⇩ 전체 엑셀</button>
        </div>
      </div>

      <div className="grid-wrap max-h-[calc(100vh-290px)] min-h-[300px]">
        <table className="grid-table">
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, minWidth: c.width, left: pinOffsets[c.key] }}
                  className={`${c.key in pinOffsets ? "pin" : ""} ${c.key === lastPin ? "pin-last" : ""} ${c.align === "right" ? "text-right" : ""}`}
                  aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button className="w-full text-inherit" style={{ textAlign: c.align === "right" ? "right" : "left" }} onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === "desc" ? "asc" : "desc" })}>
                    {c.label}
                    <span className="ml-0.5 text-slate-400">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.item.id} className={`cursor-pointer ${sel === r.item.id ? "sel" : ""} ${r.effectiveStatus === "CANCELLED" ? "text-slate-400" : ""}`} onClick={() => setF({ ...f, sel: r.item.id } as Filters)}>
                {visible.map((c) => (
                  <td key={c.key} style={{ left: pinOffsets[c.key], maxWidth: c.width }} className={`${c.key in pinOffsets ? "pin" : ""} ${c.key === lastPin ? "pin-last" : ""} ${c.align === "right" ? "text-right tabular-nums" : ""} overflow-hidden text-ellipsis`}>
                    <Cell c={c} r={r} un={un} />
                  </td>
                ))}
              </tr>
            ))}
            {!view.length && (
              <tr>
                <td colSpan={visible.length} className="py-10 text-center text-slate-500">조건에 맞는 발주가 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-1">
        <button className="btn" disabled={page <= 1} onClick={() => setPage(1)}>«</button>
        <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ 이전</button>
        <span className="px-2">{page} / {pages}</span>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>다음 ›</button>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(pages)}>»</button>
      </div>

      {sel && <DetailPanel itemId={sel} onClose={() => setF({ ...f, sel: undefined } as Filters)} />}
    </div>
  );
}

function Cell({ c, r, un }: { c: ColumnDef; r: ItemRow; un: (id?: string) => string }) {
  switch (c.key) {
    case "orderNo":
      return <span className="font-mono text-[12px]">{r.order.orderNo}</span>;
    case "status":
      return <StatusBadge code={r.effectiveStatus} small />;
    case "remaining":
      return r.remaining > 0 && r.effectiveStatus !== "CANCELLED" ? <b className="text-amber-800">{r.remaining}</b> : <span className="text-slate-400">0</span>;
    case "due": {
      const d = r.item.dueDate ?? r.order.dueDate;
      return (
        <span className="inline-flex items-center gap-1">
          {d ?? <span className="text-slate-400">—</span>}
          {r.overdue && <Flag kind="overdue" />}
          {r.dueSoon && <Flag kind="soon" />}
        </span>
      );
    }
    case "unitPrice":
      return r.item.unitPrice === null ? <span className="text-slate-400" title={r.item.priceNote ?? "단가 미입력"}>{r.item.priceNote ?? "미입력"}</span> : <>{fmtNum(r.item.unitPrice, r.item.currency)}{r.item.unitPrice === 0 && <span className="ml-1 text-[11px] text-slate-500">{r.item.priceNote ?? "0원"}</span>}</>;
    case "amount":
      return r.amount === null ? <span className="text-slate-400">—</span> : <>{fmtNum(r.amount, r.item.currency)}</>;
    case "source":
      return <SourceTag source={r.order.source} />;
    default: {
      const v = c.value(r, un);
      return <span title={typeof v === "string" ? v : undefined}>{v ?? ""}</span>;
    }
  }
}

const fmtNum = (v: number, cur: string) => (cur === "KRW" ? v.toLocaleString() : `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Sel({ label, value, onChange, options }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: [string, string][] }) {
  return (
    <label>
      <span className="lbl">{label}</span>
      <select className={`inp ${value ? "border-blue-400 bg-blue-50" : ""}`} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">전체</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Txt({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="lbl">{label}</span>
      <input className="inp w-32" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ColumnPicker({ cols, setCols, onClose }: { cols: string[]; setCols: (c: string[]) => void; onClose: () => void }) {
  const hidden = COLUMNS.filter((c) => !cols.includes(c.key));
  const move = (i: number, d: number) => {
    const n = [...cols];
    const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setCols(n);
  };
  return (
    <div className="absolute right-0 z-30 mt-1 w-72 rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
      <div className="mb-1 flex items-center justify-between">
        <b>표시 컬럼 · 순서</b>
        <button className="text-slate-500" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <p className="mb-1 text-[11px] text-slate-500">발주번호·거래처·상품명을 맨 앞에 두면 가로 스크롤 시 고정됩니다.</p>
      <ul className="max-h-72 overflow-auto">
        {cols.map((k, i) => (
          <li key={k} className="flex items-center gap-1 py-0.5">
            <input type="checkbox" checked onChange={() => setCols(cols.filter((x) => x !== k))} aria-label={`${COLUMNS.find((c) => c.key === k)?.label} 숨기기`} />
            <span className="flex-1">{COLUMNS.find((c) => c.key === k)?.label}{PINNED.has(k) && <span className="ml-1 text-[11px] text-slate-400">고정가능</span>}</span>
            <button className="px-1 text-slate-500" onClick={() => move(i, -1)} aria-label="위로">▲</button>
            <button className="px-1 text-slate-500" onClick={() => move(i, 1)} aria-label="아래로">▼</button>
          </li>
        ))}
        {hidden.map((c) => (
          <li key={c.key} className="flex items-center gap-1 py-0.5 text-slate-500">
            <input type="checkbox" checked={false} onChange={() => setCols([...cols, c.key])} aria-label={`${c.label} 표시`} />
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      <button className="btn mt-2 w-full justify-center" onClick={() => setCols(DEFAULT_COLUMNS)}>기본값으로</button>
    </div>
  );
}
