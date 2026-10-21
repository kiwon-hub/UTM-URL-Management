"use client";
// 로그인 확인: 로그인하지 않으면 어떤 화면·데이터도 보이지 않습니다.
// 한 번 로그인하면 그 브라우저에서는 로그아웃할 때까지 로그인이 유지됩니다.
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { errMsg, sb } from "@/lib/supabase";
import { DataProvider } from "@/lib/store";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="p-10 text-center text-slate-500">확인 중…</div>;
  if (recovery && session) return <SetPassword onDone={() => setRecovery(false)} />;
  if (!session) return <Login />;
  return <DataProvider session={session}>{children}</DataProvider>;
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 text-[18px] font-bold">KIWON 발주관리</div>
        <div className="mb-5 text-[12px] text-slate-500">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Login() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) setMsg({ ok: false, text: /confirm/i.test(error.message) ? "이메일 인증이 아직 안 됐습니다. 받은 메일의 링크를 눌러 주세요." : "이메일 또는 비밀번호가 맞지 않습니다." });
      } else if (mode === "signup") {
        if (pw.length < 8) return setMsg({ ok: false, text: "비밀번호는 8자 이상으로 정하세요." });
        if (pw !== pw2) return setMsg({ ok: false, text: "비밀번호 확인이 일치하지 않습니다." });
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: window.location.origin } });
        if (error) setMsg({ ok: false, text: /등록되지 않은|Database error/.test(error.message) ? "등록되지 않은 이메일입니다. 관리자에게 직원 등록을 요청하세요." : errMsg(error) });
        else if (data.session) setMsg({ ok: true, text: "가입되었습니다." });
        else setMsg({ ok: true, text: "인증 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요. (메일이 안 보이면 스팸함 확인)" });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        setMsg(error ? { ok: false, text: errMsg(error) } : { ok: true, text: "비밀번호 재설정 메일을 보냈습니다." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box title={mode === "login" ? "회사 직원 전용 — 로그인" : mode === "signup" ? "처음 사용: 등록된 이메일로 비밀번호 만들기" : "비밀번호 재설정"}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="lbl">이메일</span>
          <input className="inp w-full" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {mode !== "reset" && (
          <label className="block">
            <span className="lbl">비밀번호</span>
            <input className="inp w-full" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
        )}
        {mode === "signup" && (
          <label className="block">
            <span className="lbl">비밀번호 확인</span>
            <input className="inp w-full" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </label>
        )}
        {msg && <p className={`rounded px-2 py-1.5 text-[12px] ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
        <button className="btn-primary h-9 w-full justify-center" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : mode === "signup" ? "비밀번호 만들기" : "재설정 메일 보내기"}</button>
      </form>
      <div className="mt-4 flex justify-between text-[12px] text-slate-600">
        {mode === "login" ? (
          <>
            <button className="underline" onClick={() => { setMode("signup"); setMsg(null); }}>처음 사용하시나요?</button>
            <button className="underline" onClick={() => { setMode("reset"); setMsg(null); }}>비밀번호를 잊었어요</button>
          </>
        ) : (
          <button className="underline" onClick={() => { setMode("login"); setMsg(null); }}>← 로그인으로</button>
        )}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">관리자가 등록한 직원만 사용할 수 있습니다. 한 번 로그인하면 이 브라우저에서는 로그아웃 전까지 유지됩니다. 공용 PC에서는 사용 후 로그아웃하세요.</p>
    </Box>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <Box title="새 비밀번호 설정">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return setMsg("8자 이상으로 정하세요.");
          const { error } = await sb.auth.updateUser({ password: pw });
          if (error) setMsg(errMsg(error));
          else onDone();
        }}
      >
        <input className="inp w-full" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="새 비밀번호 (8자 이상)" autoFocus />
        {msg && <p className="text-[12px] text-red-700">{msg}</p>}
        <button className="btn-primary h-9 w-full justify-center">저장</button>
      </form>
    </Box>
  );
}
