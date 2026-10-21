"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/store";
import { Flag } from "./StatusBadge";

const NAV = [
  { href: "/", label: "대시보드", icon: "▦" },
  { href: "/orders", label: "통합 발주목록", icon: "☰" },
  { href: "/orders/new", label: "신규 발주 등록", icon: "＋" },
  { href: "/import", label: "엑셀 업로드", icon: "⇪" },
  { href: "/customers", label: "거래처", icon: "◎" },
  { href: "/settings", label: "설정·이력", icon: "⚙" },
];
const ROLE = { ADMIN: "관리자", STAFF: "일반 직원", VIEWER: "조회 전용" } as const;

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { me, live, signOut } = useData();
  const isActive = (href: string) => (href === "/" ? path === "/" : href === "/orders" ? path === "/orders" : path.startsWith(href));
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-48 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-900">KIWON 발주관리</div>
          <div className="text-[11px] text-slate-500">기원툴스 · 기원MRO</div>
        </div>
        <nav className="p-2">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`mb-0.5 flex items-center gap-2 rounded px-3 py-2 text-[13px] ${isActive(n.href) ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
              <span aria-hidden className="w-4 text-center">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded px-2 py-1 text-[12px] whitespace-nowrap ${isActive(n.href) ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600"}`}>{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-[12px]">
            <span className={`hidden items-center gap-1 sm:inline-flex ${live ? "text-emerald-700" : "text-slate-400"}`} title={live ? "다른 직원의 변경이 바로 반영됩니다" : "실시간 연결 대기 중"}>
              {live ? "● 실시간" : "○ 연결 중"}
            </span>
            <DueBell />
            <span className="whitespace-nowrap"><b>{me.name}</b> <span className="text-slate-500">({ROLE[me.role]})</span></span>
            <button className="btn h-7" onClick={() => signOut()}>로그아웃</button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 md:p-4">{children}</main>
      </div>
    </div>
  );
}

/** 납기 알림: 내 담당 품목 중 지연·임박 건 */
function DueBell() {
  const { rows, me } = useData();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const mine = useMemo(
    () => rows.filter((r) => (r.item.assigneeId ?? r.order.assigneeId) === me.id && (r.overdue || r.dueSoon)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.item.dueDate ?? a.order.dueDate ?? "").localeCompare(b.item.dueDate ?? b.order.dueDate ?? "")),
    [rows, me.id],
  );
  const overdue = mine.filter((r) => r.overdue).length;
  // 하루에 한 번, 로그인 후 알림 띄우기
  useEffect(() => {
    if (!mine.length) return;
    const key = `kiwon-due-toast:${me.id}:${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    setToast(`내 담당 납기 지연 ${overdue}건 · 임박 ${mine.length - overdue}건이 있습니다.`);
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine.length > 0]);
  return (
    <div className="relative">
      <button className="btn h-7" onClick={() => setOpen(!open)} aria-label={`납기 알림 ${mine.length}건`} aria-expanded={open}>
        🔔{mine.length > 0 && <span className={`rounded-full px-1.5 text-[11px] font-bold text-white ${overdue ? "bg-red-600" : "bg-orange-500"}`}>{mine.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-96 w-80 overflow-auto rounded-lg border border-slate-300 bg-white p-2 shadow-xl">
          <div className="mb-1 font-semibold">내 담당 납기 알림</div>
          {!mine.length && <p className="py-4 text-center text-slate-500">지연·임박 건이 없습니다.</p>}
          <ul className="divide-y divide-slate-100">
            {mine.slice(0, 30).map((r) => (
              <li key={r.item.id}>
                <Link href={`/orders?q=${encodeURIComponent(r.order.orderNo)}&sel=${r.item.id}`} onClick={() => setOpen(false)} className="block py-1.5 hover:bg-slate-50">
                  <div className="flex items-center gap-1">{r.overdue ? <Flag kind="overdue" /> : <Flag kind="soon" />}<span className="text-[11px] text-slate-500">납기 {r.item.dueDate ?? r.order.dueDate}</span><span className="ml-auto text-[11px]">미납 {r.remaining}</span></div>
                  <div className="truncate">{r.order.customerName} · {r.item.productName}</div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {toast && (
        <div role="status" className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-4 py-3 text-[13px] text-orange-900 shadow-lg">
          🔔 {toast}
          <button className="underline" onClick={() => { setOpen(true); setToast(null); }}>보기</button>
          <button aria-label="닫기" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
