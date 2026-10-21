"use client";
import { useState } from "react";
import { STATUSES } from "@/lib/status";
import { useData, userName } from "@/lib/store";
import { StatusBadge } from "@/components/StatusBadge";

const ROLE = { ADMIN: "관리자", STAFF: "일반 직원", VIEWER: "조회 전용" } as const;

export default function SettingsPage() {
  const { db, me, reset } = useData();
  const [tab, setTab] = useState<"audit" | "users" | "status">("audit");
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-bold">설정 · 이력</h1>
      <div className="flex gap-1">
        {([["audit", `전체 수정이력 (${db.audits.length})`], ["users", "사용자·권한"], ["status", "진행상태"]] as const).map(([k, l]) => (
          <button key={k} className={`btn ${tab === k ? "border-blue-500 bg-blue-50 font-semibold" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
        <button className="btn ml-auto" onClick={() => { if (confirm("시안 테스트 데이터를 처음 상태로 되돌릴까요? (이 브라우저에만 해당)")) reset(); }}>↺ 시안 데이터 초기화</button>
      </div>

      {tab === "audit" && (
        <div className="grid-wrap max-h-[70vh]">
          <table className="grid-table">
            <thead><tr><th>일시</th><th>사용자</th><th>대상</th><th>작업</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead>
            <tbody>
              {db.audits.map((a) => (
                <tr key={a.id}>
                  <td>{a.at.replace("T", " ")}</td><td>{userName(db, a.userId)}</td>
                  <td className="font-mono text-[12px]">{db.orders.find((o) => o.id === a.orderId)?.orderNo ?? a.entityId}</td>
                  <td>{a.action}</td><td>{a.field}</td>
                  <td className="max-w-[240px] truncate text-red-700">{a.before}</td><td className="max-w-[280px] truncate text-emerald-800">{a.after}</td>
                </tr>
              ))}
              {!db.audits.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">아직 변경 이력이 없습니다. 발주를 등록·수정하면 여기에 쌓입니다.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "users" && (
        <div className="card p-3">
          <p className="mb-2 text-[12px] text-slate-600">시안에서는 보기만 가능합니다. 9단계에서 관리자가 역할·사업부별 권한을 바꿀 수 있게 구현합니다. {me.role !== "ADMIN" && "(현재 사용자는 관리자가 아님)"}</p>
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600"><tr><th className="p-2 text-left">이름</th><th className="text-left">역할</th><th className="text-left">등록·수정 가능 사업부</th><th className="text-left">엑셀 표기 별칭</th></tr></thead>
            <tbody>
              {db.users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100"><td className="p-2 font-medium">{u.name}</td><td>{ROLE[u.role]}</td><td>{u.role === "ADMIN" ? "전체" : u.divisions.map((d) => (d === "TOOLS" ? "기원툴스" : "기원MRO")).join(", ") || "없음 (조회만)"}</td><td className="text-slate-500">{u.aliases.join(", ")}</td></tr>
              ))}
            </tbody>
          </table>
          <table className="mt-4 w-full text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600"><tr><th className="p-2 text-left">권한</th><th>관리자</th><th>일반 직원</th><th>조회 전용</th></tr></thead>
            <tbody>
              {[["전체 발주 조회", "●", "●", "●"], ["발주 등록·수정·납품입력", "●", "허용 사업부만", "—"], ["엑셀 일상 등록", "●", "허용 사업부만", "—"], ["엑셀 최초 이관", "●", "—", "—"], ["삭제", "●", "—", "—"], ["사용자·권한·상태값 설정", "●", "—", "—"]].map((r) => (
                <tr key={r[0]} className="border-t border-slate-100">{r.map((c, i) => <td key={i} className={i ? "text-center" : "p-2"}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "status" && (
        <div className="card p-3">
          <p className="mb-2 text-[12px] text-slate-600">상태 이름·순서·색은 2단계 이후 관리자 화면에서 수정합니다. 색만으로 구분하지 않도록 모양이 다른 기호를 함께 씁니다.</p>
          <table className="text-[13px]">
            <thead className="text-[12px] text-slate-600"><tr><th className="p-2 text-left">순서</th><th className="text-left">표시</th><th className="pl-4 text-left">집계</th><th className="pl-4 text-left">설정 방식</th></tr></thead>
            <tbody>
              {STATUSES.map((s) => (
                <tr key={s.code} className="border-t border-slate-100"><td className="p-2">{s.order}</td><td><StatusBadge code={s.code} /></td><td className="pl-4">{s.open ? "진행 중" : "종료/제외"}</td><td className="pl-4 text-slate-600">{s.code === "PARTIAL" || s.code === "DELIVERED" ? "납품이력으로 자동 판정" : "담당자가 지정"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
