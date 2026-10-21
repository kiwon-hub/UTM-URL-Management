"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useData } from "@/lib/store";
import type { ReactNode } from "react";

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
  const { db, me, setMe, ready } = useData();
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-48 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="text-[15px] font-bold text-slate-900">KIWON 발주관리</div>
          <div className="text-[11px] text-slate-500">기원툴스 · 기원MRO</div>
        </div>
        <nav className="p-2">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path === n.href || (n.href !== "/orders" && path.startsWith(n.href)) || (n.href === "/orders" && path === "/orders");
            return (
              <Link key={n.href} href={n.href} className={`mb-0.5 flex items-center gap-2 rounded px-3 py-2 text-[13px] ${active ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-700 hover:bg-slate-50"}`}>
                <span aria-hidden className="w-4 text-center">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-amber-100 px-4 py-1 text-center text-[12px] text-amber-900">
          1단계 시안입니다 — 가상 테스트 데이터만 사용하며, 입력 내용은 이 브라우저에만 저장됩니다. 운영 데이터와 연결되어 있지 않습니다.
        </div>
        <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={`rounded px-2 py-1 text-[12px] whitespace-nowrap ${path === n.href ? "bg-blue-50 font-semibold text-blue-800" : "text-slate-600"}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-[12px]">
            <span className="hidden text-slate-500 sm:inline">시연용 로그인 전환</span>
            <select className="inp h-7" value={me.id} onChange={(e) => setMe(e.target.value)} aria-label="사용자 전환">
              {db.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE[u.role]})
                </option>
              ))}
            </select>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 md:p-4">{ready ? children : <div className="p-8 text-slate-500">불러오는 중…</div>}</main>
      </div>
    </div>
  );
}
