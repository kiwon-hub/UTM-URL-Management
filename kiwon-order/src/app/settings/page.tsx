"use client";
import { useEffect, useState } from "react";
import { STATUSES } from "@/lib/status";
import { useData, userName } from "@/lib/store";
import type { AuditLog, Role, User } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

const ROLE: Record<Role, string> = { ADMIN: "관리자", STAFF: "일반 직원", VIEWER: "조회 전용" };

export default function SettingsPage() {
  const { me } = useData();
  const [tab, setTab] = useState<"users" | "audit" | "imports" | "status">(me.role === "ADMIN" ? "users" : "audit");
  return (
    <div className="space-y-2">
      <h1 className="text-lg font-bold">설정 · 이력</h1>
      <div className="flex flex-wrap gap-1">
        {([["users", "직원·권한"], ["audit", "전체 수정이력"], ["imports", "업로드 이력"], ["status", "진행상태"]] as const).map(([k, l]) => (
          <button key={k} className={`btn ${tab === k ? "border-blue-500 bg-blue-50 font-semibold" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "users" && <Users />}
      {tab === "audit" && <Audits />}
      {tab === "imports" && <Imports />}
      {tab === "status" && <Statuses />}
    </div>
  );
}

function Users() {
  const { db, me, adminUpsertUser } = useData();
  const isAdmin = me.role === "ADMIN";
  const [edit, setEdit] = useState<Partial<User> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const users = [...db.users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "ko"));

  async function save() {
    if (!edit?.email || !edit.name || !edit.role) return setErr("이메일·이름·권한을 입력하세요.");
    setBusy(true);
    const r = await adminUpsertUser({ ...edit, email: edit.email, name: edit.name, role: edit.role, active: edit.active ?? true, aliases: edit.aliases ?? [] });
    setBusy(false);
    if ("error" in r) setErr(r.error);
    else {
      setEdit(null);
      setErr(null);
    }
  }

  return (
    <div className="card space-y-3 p-3">
      <div className="rounded bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700">
        <b>로그인 방법</b> — 관리자가 아래에 직원 이메일을 등록하면, 그 직원은 로그인 화면의 <b>&quot;처음 사용하시나요?&quot;</b>에서 같은 이메일로 비밀번호를 만들고
        인증 메일의 링크를 누르면 사용할 수 있습니다. <b>등록되지 않은 이메일은 가입 자체가 막혀</b> 아무것도 볼 수 없습니다.
        퇴사·권한 회수 시 &apos;사용 중지&apos;로 바꾸면 즉시 접근이 차단됩니다.
      </div>
      {isAdmin && !edit && <button className="btn-primary" onClick={() => setEdit({ role: "STAFF", active: true, aliases: [] })}>＋ 직원 등록</button>}
      {edit && (
        <div className="grid gap-2 rounded border border-blue-200 bg-blue-50/40 p-3 md:grid-cols-6">
          <label className="md:col-span-2"><span className="lbl">이메일 *</span><input className="inp w-full" type="email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
          <label><span className="lbl">이름 *</span><input className="inp w-full" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="예: 민구" /></label>
          <label><span className="lbl">권한 *</span>
            <select className="inp w-full" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
              {(Object.keys(ROLE) as Role[]).map((r) => <option key={r} value={r}>{ROLE[r]}</option>)}
            </select>
          </label>
          <label className="md:col-span-2"><span className="lbl">엑셀 담당자 표기 (쉼표로 구분)</span><input className="inp w-full" value={(edit.aliases ?? []).join(", ")} onChange={(e) => setEdit({ ...edit, aliases: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="예: 신종현과장님, 종현" /></label>
          {edit.id && <label className="inline-flex items-center gap-1"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> 사용 중</label>}
          <div className="flex items-end gap-1 md:col-span-6">
            <button className="btn-primary" disabled={busy} onClick={save}>저장</button>
            <button className="btn" onClick={() => { setEdit(null); setErr(null); }}>취소</button>
            {err && <span className="text-[12px] text-red-700">⚠ {err}</span>}
          </div>
        </div>
      )}
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 text-[12px] text-slate-600">
          <tr><th className="p-2 text-left">이름</th><th className="text-left">이메일</th><th className="text-left">권한</th><th className="text-left">상태</th><th className="text-left">엑셀 표기</th><th /></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={`border-t border-slate-100 ${u.active ? "" : "text-slate-400"}`}>
              <td className="p-2 font-medium">{u.name}{u.id === me.id && <span className="ml-1 text-[11px] text-blue-700">(나)</span>}</td>
              <td>{u.email}</td>
              <td>{ROLE[u.role]}</td>
              <td>{!u.active ? "⊘ 사용 중지" : u.authUserId ? <span className="text-emerald-700">✔ 가입 완료</span> : <span className="text-amber-700">◔ 가입 대기 (비밀번호 미설정)</span>}</td>
              <td className="text-slate-500">{u.aliases.join(", ")}</td>
              <td className="text-right">{isAdmin && <button className="text-[12px] underline" onClick={() => setEdit(u)}>수정</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 text-[12px] text-slate-600"><tr><th className="p-2 text-left">권한별 가능 작업</th><th>관리자</th><th>일반 직원</th><th>조회 전용</th></tr></thead>
        <tbody>
          {[["전체 발주 조회", "●", "●", "●"], ["발주 등록·수정·납품입력", "●", "●", "—"], ["엑셀 일상 등록", "●", "●", "—"], ["엑셀 최초 이관", "●", "—", "—"], ["직원 등록·권한 변경", "●", "—", "—"]].map((r) => (
            <tr key={r[0]} className="border-t border-slate-100">{r.map((c, i) => <td key={i} className={i ? "text-center" : "p-2"}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-500">권한 검사는 화면뿐 아니라 DB 서버에서 한 번 더 합니다. 화면을 조작해도 권한 밖의 작업은 저장되지 않습니다.</p>
    </div>
  );
}

function Audits() {
  const { db, fetchAudits } = useData();
  const [list, setList] = useState<AuditLog[] | null>(null);
  useEffect(() => {
    fetchAudits(undefined, 300).then(setList);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ACT: Record<string, string> = { CREATE: "등록", UPDATE: "수정", STATUS: "상태변경", IMPORT: "엑셀업로드", DELETE: "삭제" };
  return (
    <div className="grid-wrap max-h-[70vh]">
      <table className="grid-table">
        <thead><tr><th>일시</th><th>사용자</th><th>발주</th><th>작업</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead>
        <tbody>
          {list === null && <tr><td colSpan={7} className="py-8 text-center text-slate-500">불러오는 중…</td></tr>}
          {(list ?? []).map((a) => (
            <tr key={a.id}>
              <td>{a.at.replace("T", " ")}</td><td>{userName(db, a.userId)}</td>
              <td className="font-mono text-[12px]">{db.orders.find((o) => o.id === a.orderId)?.orderNo ?? ""}</td>
              <td>{ACT[a.action] ?? a.action}</td><td>{a.field}</td>
              <td className="max-w-[240px] truncate text-red-700">{a.before}</td><td className="max-w-[280px] truncate text-emerald-800">{a.after}</td>
            </tr>
          ))}
          {list?.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-500">아직 변경 이력이 없습니다.</td></tr>}
        </tbody>
      </table>
      <p className="p-2 text-[11px] text-slate-500">최근 300건. 발주별 전체 이력은 목록에서 행을 눌러 &apos;수정이력&apos; 탭에서 볼 수 있습니다.</p>
    </div>
  );
}

function Imports() {
  const { db } = useData();
  return (
    <div className="card p-3">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 text-[12px] text-slate-600"><tr><th className="p-2 text-left">일시</th><th className="text-left">작업자</th><th className="text-left">파일</th><th className="text-left">종류</th><th className="text-right">전체</th><th className="text-right">신규</th><th className="text-right">갱신</th><th className="text-right">건너뜀</th><th className="pr-2 text-right">오류</th></tr></thead>
        <tbody>
          {db.imports.map((b) => (
            <tr key={b.id} className="border-t border-slate-100"><td className="p-2">{b.at.replace("T", " ")}</td><td>{userName(db, b.userId)}</td><td>{b.fileName}</td><td>{b.mode === "MIGRATION" ? "최초 이관" : "일상 등록"}</td><td className="text-right">{b.total}</td><td className="text-right">{b.inserted}</td><td className="text-right">{b.updated}</td><td className="text-right">{b.skipped}</td><td className="pr-2 text-right">{b.errors}</td></tr>
          ))}
          {!db.imports.length && <tr><td colSpan={9} className="py-6 text-center text-slate-500">업로드 이력이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Statuses() {
  return (
    <div className="card p-3">
      <p className="mb-2 text-[12px] text-slate-600">색만으로 구분하지 않도록 모양이 다른 기호를 함께 씁니다. 상태 이름 변경 기능은 2차에 추가합니다.</p>
      <table className="text-[13px]">
        <thead className="text-[12px] text-slate-600"><tr><th className="p-2 text-left">순서</th><th className="text-left">표시</th><th className="pl-4 text-left">집계</th><th className="pl-4 text-left">설정 방식</th></tr></thead>
        <tbody>
          {STATUSES.map((s) => (
            <tr key={s.code} className="border-t border-slate-100"><td className="p-2">{s.order}</td><td><StatusBadge code={s.code} /></td><td className="pl-4">{s.open ? "진행 중" : "종료/제외"}</td><td className="pl-4 text-slate-600">{s.code === "PARTIAL" || s.code === "DELIVERED" ? "납품이력으로 자동 판정" : "담당자가 지정"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
