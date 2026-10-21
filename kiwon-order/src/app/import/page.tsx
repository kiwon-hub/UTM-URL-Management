"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buildCommit } from "@/lib/excel/commit";
import { exportErrorRows, exportTemplate } from "@/lib/excel/export";
import { FIELD_LABELS, guessMapping, REQUIRED_FIELDS, sheetToOrderType, type FieldKey } from "@/lib/excel/normalize";
import { readWorkbook, sha256, type RawSheet } from "@/lib/excel/parse";
import { buildPreview, summarize, type ImportOptions, type PreviewRow } from "@/lib/excel/validate";
import { label, ORDER_TYPES } from "@/lib/status";
import { useData, userName } from "@/lib/store";
import type { ImportBatch, OrderTypeCode } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";

const STEPS = ["파일 선택", "시트 선택", "컬럼 매핑", "미리보기", "오류·중복 확인", "등록 방식", "최종 확인", "결과"];
const MAX_MB = 20;

export default function ImportPage() {
  const { db, me, can, commitImport } = useData();
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ImportOptions["mode"]>("DAILY");
  const [fileName, setFileName] = useState("");
  const [hash, setHash] = useState("");
  const [sheets, setSheets] = useState<RawSheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mappings, setMappings] = useState<Record<string, FieldKey[]>>({});
  const [types, setTypes] = useState<Record<string, OrderTypeCode>>({});
  const [mapSheet, setMapSheet] = useState("");
  const [opts, setOpts] = useState<Omit<ImportOptions, "mode">>({ baseYear: new Date().getFullYear(), grouping: "CONSECUTIVE", shipDateAsDelivered: true, strikeAsCancelled: true, yellowAsDone: false, updateExisting: false });
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | PreviewRow["state"]>("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ImportBatch | null>(null);
  const [importCustomers, setImportCustomers] = useState(true);

  const options: ImportOptions = { ...opts, mode };
  const orderSheets = sheets.filter((s) => s.role === "orders" && selected.has(s.name));
  const customerSheet = mode === "MIGRATION" && importCustomers ? sheets.find((s) => s.role === "customers" && selected.has(s.name)) ?? null : null;
  const dupFile = hash && db.importedHashes.includes(hash);

  const existingFingerprints = useMemo(() => new Set(db.legacyRows.filter((l) => l.itemId).map((l) => l.fingerprint)), [db.legacyRows]);
  const existingLines = useMemo(() => {
    const o = new Map(db.orders.map((x) => [x.id, x.orderNo]));
    return new Set(db.items.map((i) => `${o.get(i.orderId)}#${i.lineNo}`));
  }, [db.items, db.orders]);

  const previews = useMemo(() => {
    if (step < 4) return [];
    return orderSheets.flatMap((s) => buildPreview(s, mappings[s.name] ?? [], { users: db.users, existingFingerprints, existingLines, options, orderType: types[s.name] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sheets, selected, mappings, types, opts, mode, existingFingerprints, existingLines]);
  const sum = useMemo(() => summarize(previews.filter((p) => !exclude.has(p.key))), [previews, exclude]);

  if (!can("create")) return <p className="card p-6">엑셀 업로드 권한이 없습니다 (조회 전용).</p>;

  async function onFile(file: File) {
    setErr(null);
    setLoading(true);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error(".xlsx 파일만 올릴 수 있습니다. (.xls 는 엑셀에서 '다른 이름으로 저장 → xlsx' 후 올려주세요)");
      if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${MAX_MB}MB 이하 파일만 올릴 수 있습니다.`);
      const buf = await file.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 4));
      if (!(head[0] === 0x50 && head[1] === 0x4b)) throw new Error("엑셀(xlsx) 형식이 아닌 파일입니다.");
      const [h, ss] = await Promise.all([sha256(buf), readWorkbook(buf)]);
      setFileName(file.name);
      setHash(h);
      setSheets(ss);
      setSelected(new Set(ss.filter((s) => s.role === "orders" || (mode === "MIGRATION" && s.role === "customers")).map((s) => s.name)));
      setMappings(Object.fromEntries(ss.map((s) => [s.name, guessMapping(s.headers)])));
      setTypes(Object.fromEntries(ss.map((s) => [s.name, sheetToOrderType(s.name) ?? "TOOLS"])));
      setMapSheet(ss.find((s) => s.role === "orders")?.name ?? "");
      // 최초 이관은 임의로 묶지 않음(원본 1행 = 1건), 일상 등록은 연속 행 묶기를 기본으로
      setOpts((o) => ({ ...o, grouping: mode === "MIGRATION" ? "ROW" : "CONSECUTIVE" }));
      setStep(2);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function save() {
    const c = buildCommit({ previews, options, fileName, fileHash: hash, includeKeys: include, excludeKeys: exclude, customerSheet });
    const r = commitImport(c);
    if ("error" in r) setErr(r.error);
    else {
      setResult(r);
      setStep(8);
    }
  }

  const mappingProblems = orderSheets.flatMap((s) => {
    const m = mappings[s.name] ?? [];
    return REQUIRED_FIELDS.filter((f) => !m.includes(f)).map((f) => `${s.name}: '${FIELD_LABELS[f]}' 열이 지정되지 않음`);
  });

  const shown = previews.filter((p) => filter === "all" || p.state === filter);
  const PAGE = 100;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">엑셀 업로드</h1>
        <button className="btn ml-auto" onClick={exportTemplate}>⇩ 업로드 양식 받기</button>
      </div>

      <ol className="flex flex-wrap gap-1 text-[12px]">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded px-2 py-1 ${step === i + 1 ? "bg-blue-600 font-semibold text-white" : step > i + 1 ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-500"}`}>
            {step > i + 1 ? "✔" : i + 1}. {s}
          </li>
        ))}
      </ol>
      {err && <div role="alert" className="rounded bg-red-50 px-3 py-2 text-red-800">⚠ {err}</div>}

      {step === 1 && (
        <section className="card space-y-3 p-4">
          <div>
            <div className="lbl">업로드 종류</div>
            <div className="grid gap-2 md:grid-cols-2">
              <ModeCard active={mode === "DAILY"} onClick={() => setMode("DAILY")} title="일상 등록" desc="새 발주를 엑셀로 한꺼번에 등록하거나, 내려받은 목록을 고쳐서 다시 올립니다. 시트 1~2개, 표준 양식 권장." />
              <ModeCard
                active={mode === "MIGRATION"}
                disabled={me.role !== "ADMIN"}
                onClick={() => setMode("MIGRATION")}
                title="최초 데이터 이관 (관리자)"
                desc="'2026_기원 발주내역서.xlsx' 처럼 기존 대장 전체를 옮깁니다. 모든 원본 행·서식(취소선·노란색)·셀 메모를 보존하고 발주번호는 L- 로 시작합니다."
              />
            </div>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-10 text-slate-600 hover:border-blue-400">
            <span className="text-2xl">⇪</span>
            <span className="font-semibold">{loading ? "파일을 읽는 중…" : "엑셀 파일(.xlsx)을 선택하세요"}</span>
            <span className="text-[12px]">최대 {MAX_MB}MB · 파일은 이 브라우저 안에서만 읽습니다 (시안)</span>
            <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" disabled={loading} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <UploadHistory />
        </section>
      )}

      {step === 2 && (
        <section className="card p-4">
          <p className="mb-2">
            <b>{fileName}</b> · 시트 {sheets.length}개
            {dupFile && <span className="ml-2 rounded bg-red-50 px-2 py-0.5 text-[12px] text-red-800">⚠ 이전에 업로드한 파일과 내용이 같습니다 — 중복 행은 자동으로 건너뜁니다</span>}
          </p>
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-[12px] text-slate-600">
              <tr>
                <th className="w-10 p-2"><input type="checkbox" aria-label="전체 시트 선택" checked={sheets.filter((s) => s.role !== "skip").every((s) => selected.has(s.name))} onChange={(e) => setSelected(new Set(e.target.checked ? sheets.filter((s) => s.role !== "skip").map((s) => s.name) : []))} /></th>
                <th className="text-left">시트</th>
                <th className="text-left">판정</th>
                <th className="text-right">데이터 행</th>
                <th className="text-right">빈 행</th>
                <th className="pl-4 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map((s) => (
                <tr key={s.name} className="border-t border-slate-100">
                  <td className="p-2 text-center">
                    <input type="checkbox" disabled={s.role === "skip" || (s.role === "customers" && mode !== "MIGRATION")} checked={selected.has(s.name)} onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(s.name); else n.delete(s.name); setSelected(n); }} aria-label={`${s.name} 선택`} />
                  </td>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.role === "orders" ? `발주 → ${label.orderType(types[s.name])}` : s.role === "customers" ? "거래처 정보" : "가져오지 않음 (계산용 시트)"}</td>
                  <td className="text-right">{s.rows.length.toLocaleString()}</td>
                  <td className="text-right">{s.blankRows}</td>
                  <td className="pl-4 text-[12px] text-slate-600">
                    {s.mergedRanges.length > 0 && <div>병합셀 {s.mergedRanges.length}곳 (값 복사 처리)</div>}
                    {s.stopReason && <div className="text-amber-800">{s.stopReason}</div>}
                    {s.role === "customers" && mode !== "MIGRATION" && <div>거래처 시트는 최초 이관에서만 가져옵니다</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mode === "MIGRATION" && sheets.some((s) => s.role === "customers") && (
            <label className="mt-2 inline-flex items-center gap-1 text-[13px]"><input type="checkbox" checked={importCustomers} onChange={(e) => setImportCustomers(e.target.checked)} /> 업체 정보 시트로 거래처 등록 (같은 이름은 비어 있는 칸만 보충)</label>
          )}
          <Nav back={() => setStep(1)} next={() => setStep(3)} nextDisabled={!orderSheets.length} />
        </section>
      )}

      {step === 3 && (
        <section className="card p-4">
          <div className="mb-2 flex flex-wrap gap-1">
            {orderSheets.map((s) => (
              <button key={s.name} className={`btn ${mapSheet === s.name ? "border-blue-500 bg-blue-50 font-semibold" : ""}`} onClick={() => setMapSheet(s.name)}>{s.name}</button>
            ))}
          </div>
          {orderSheets.filter((s) => s.name === mapSheet).map((s) => (
            <div key={s.name}>
              <label className="mb-2 inline-flex items-center gap-2">
                <span className="lbl mb-0">발주구분</span>
                <select className="inp" value={types[s.name]} onChange={(e) => setTypes({ ...types, [s.name]: e.target.value as OrderTypeCode })}>
                  {ORDER_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label} ({label.division(t.division)})</option>)}
                </select>
              </label>
              <div className="overflow-x-auto">
                <table className="text-[13px]">
                  <thead className="bg-slate-50 text-[12px] text-slate-600">
                    <tr><th className="p-2 text-left">엑셀 열</th><th className="text-left">→ 시스템 항목</th><th className="pl-4 text-left">예시 값 (처음 3행)</th></tr>
                  </thead>
                  <tbody>
                    {s.headers.map((h, i) => {
                      const m = mappings[s.name][i];
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="p-2 font-medium">{h || <i className="text-slate-400">(제목 없음)</i>}</td>
                          <td>
                            <select className={`inp w-48 ${m === "ignore" ? "text-slate-400" : ""}`} value={m} onChange={(e) => { const n = [...mappings[s.name]]; n[i] = e.target.value as FieldKey; setMappings({ ...mappings, [s.name]: n }); }}>
                              {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => <option key={k} value={k}>{FIELD_LABELS[k]}{REQUIRED_FIELDS.includes(k) ? " *" : ""}</option>)}
                            </select>
                          </td>
                          <td className="max-w-[420px] truncate pl-4 text-slate-600">{s.rows.slice(0, 3).map((r) => fmt(r.cells[i])).join("  |  ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {mappingProblems.length > 0 && <ul className="mt-2 text-[12px] text-red-700">{mappingProblems.map((p) => <li key={p}>⚠ {p}</li>)}</ul>}
          <Nav back={() => setStep(2)} next={() => setStep(4)} nextDisabled={mappingProblems.length > 0} />
        </section>
      )}

      {(step === 4 || step === 5) && (
        <section className="card p-4">
          {step === 4 && (
            <div className="mb-3 grid gap-2 rounded bg-slate-50 p-3 text-[13px] md:grid-cols-2">
              <div>
                <div className="lbl">발주 묶기</div>
                <label className="mr-3"><input type="radio" checked={opts.grouping === "ROW"} onChange={() => setOpts({ ...opts, grouping: "ROW" })} /> 행마다 발주 1건 (원본 그대로)</label>
                <label><input type="radio" checked={opts.grouping === "CONSECUTIVE"} onChange={() => setOpts({ ...opts, grouping: "CONSECUTIVE" })} /> 같은 날짜·같은 거래처 연속 행을 1건으로 (빈 행에서 끊음, 추천)</label>
                {mode === "MIGRATION" && <p className="mt-1 text-[11px] text-slate-500">최초 이관은 과거 발주를 임의로 합치지 않도록 &apos;행마다 1건&apos;이 기본입니다. 묶어도 원본 행 번호는 모두 보존됩니다.</p>}
              </div>
              <div>
                <div className="lbl">서식·날짜 해석 <span className="font-normal text-slate-400">(엑셀 분석 결과 기반 제안 — 확정 전)</span></div>
                <label className="block"><input type="checkbox" checked={opts.shipDateAsDelivered} onChange={(e) => setOpts({ ...opts, shipDateAsDelivered: e.target.checked })} /> 발송날짜가 있으면 그 날짜에 전량 납품으로 등록 (메모에 분할 기록이 있으면 제외)</label>
                <label className="block"><input type="checkbox" checked={opts.strikeAsCancelled} onChange={(e) => setOpts({ ...opts, strikeAsCancelled: e.target.checked })} /> 행 전체 취소선 → 취소</label>
                <label className="block"><input type="checkbox" checked={opts.yellowAsDone} onChange={(e) => setOpts({ ...opts, yellowAsDone: e.target.checked })} /> 노란색 행 → 납품완료 (발송날짜 없어도)</label>
                <label className="block">연도 없는 날짜(예: 6/11)의 기준 연도 <input type="number" className="inp ml-1 h-7 w-20" value={opts.baseYear} onChange={(e) => setOpts({ ...opts, baseYear: Number(e.target.value) })} /></label>
              </div>
            </div>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-1 text-[13px]">
            {([["all", `전체 ${previews.length}`], ["ok", `✔ 정상 ${sum.ok}`], ["warn", `◔ 확인 ${sum.warn}`], ["error", `✕ 오류 ${sum.error}`], ["duplicate", `⧉ 중복 ${sum.duplicate}`], ["update", `↻ 갱신 ${sum.update}`]] as const).map(([k, l]) => (
              <button key={k} className={`btn ${filter === k ? "border-blue-500 bg-blue-50 font-semibold" : ""}`} onClick={() => { setFilter(k); setPage(1); }}>{l}</button>
            ))}
            <span className="ml-2 text-slate-600">→ 발주 <b>{sum.orders}</b>건으로 등록 예정</span>
            {step === 5 && (
              <button className="btn ml-auto" disabled={!sum.error && !sum.warn} onClick={() => exportErrorRows(previews.filter((p) => p.state === "error" || p.state === "warn").map((p) => ({ sheet: p.sheet, rowNo: p.rowNo, raw: p.raw, issues: p.issues.map((i) => `${i.level === "error" ? "[오류]" : "[확인]"} ${i.msg}`) })), `업로드_오류행_${fileName.replace(/\.xlsx$/i, "")}.xlsx`)}>
                ⇩ 오류·확인 행 엑셀 받기
              </button>
            )}
          </div>
          <div className="grid-wrap max-h-[55vh]">
            <table className="grid-table text-[12px]">
              <thead>
                <tr>
                  <th>상태</th><th>시트!행</th><th>묶음</th><th>발주일</th><th>거래처</th><th>경로</th><th>품번</th><th>상품명</th><th>규격</th><th className="text-right">수량</th><th>단위</th><th className="text-right">단가</th><th>담당</th><th>발송일</th><th>등록 상태</th><th>확인 내용</th>{step === 5 && <th>포함</th>}
                </tr>
              </thead>
              <tbody>
                {shown.slice((page - 1) * PAGE, page * PAGE).map((p) => (
                  <tr key={p.key} className={exclude.has(p.key) ? "text-slate-400 line-through" : ""}>
                    <td><StateTag s={p.state} /></td>
                    <td className="font-mono">{p.key}</td>
                    <td className="text-slate-500">{p.groupKey.split("#")[1]}</td>
                    <td>{p.fields.orderDate ?? <span className="text-red-700">—</span>}</td>
                    <td className="max-w-[140px] truncate" title={p.fields.customerRaw}>{p.fields.customerName}</td>
                    <td>{label.channel(p.fields.channel)}</td>
                    <td>{p.fields.productCode}</td>
                    <td className="max-w-[200px] truncate" title={p.fields.productName}>{p.fields.productName}</td>
                    <td className="max-w-[140px] truncate">{p.fields.spec}</td>
                    <td className="text-right">{p.fields.qty ?? <span className="text-amber-700">공란</span>}</td>
                    <td>{p.fields.unit}</td>
                    <td className="text-right">{p.fields.unitPrice === null ? <span className="text-slate-400">{p.fields.priceNote ?? "미입력"}</span> : `${p.fields.currency === "USD" ? "$" : ""}${p.fields.unitPrice.toLocaleString()}`}</td>
                    <td>{userName(db, p.fields.assigneeId ?? undefined) || <span className="text-slate-400">{p.fields.assigneeRaw}</span>}</td>
                    <td>{p.fields.shipDate}</td>
                    <td><StatusBadge code={p.suggestedStatus} small /></td>
                    <td className="max-w-[360px] truncate" title={p.issues.map((i) => i.msg).join("\n")}>
                      {p.issues.map((i, n) => <span key={n} className={i.level === "error" ? "text-red-700" : "text-amber-800"}>{n ? " · " : ""}{i.field ? `[${i.field}] ` : ""}{i.msg}</span>)}
                    </td>
                    {step === 5 && (
                      <td className="text-center">
                        {p.state === "duplicate" ? (
                          <input type="checkbox" aria-label="중복이지만 등록" checked={include.has(p.key)} onChange={(e) => { const n = new Set(include); if (e.target.checked) n.add(p.key); else n.delete(p.key); setInclude(n); }} />
                        ) : p.state !== "error" ? (
                          <input type="checkbox" aria-label="이 행 등록" checked={!exclude.has(p.key)} onChange={(e) => { const n = new Set(exclude); if (!e.target.checked) n.add(p.key); else n.delete(p.key); setExclude(n); }} />
                        ) : (
                          <span className="text-slate-400">원본만</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1 flex items-center justify-center gap-1 text-[12px]">
            <button className="btn h-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
            {page} / {pages}
            <button className="btn h-7" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button>
          </div>
          {step === 5 && <p className="mt-2 text-[12px] text-slate-600">오류 행은 발주로 만들지 않지만, 원본 행 정보는 업로드 이력에 그대로 보존됩니다. 중복 행은 기본적으로 건너뛰며, 체크하면 등록합니다.</p>}
          <Nav back={() => setStep(step - 1)} next={() => setStep(step + 1)} />
        </section>
      )}

      {step === 6 && (
        <section className="card space-y-3 p-4 text-[13px]">
          <div className="lbl">등록 방식</div>
          <label className="block"><input type="radio" checked={!opts.updateExisting} onChange={() => setOpts({ ...opts, updateExisting: false })} /> <b>신규 등록만</b> — 모든 행을 새 발주로 추가합니다. 같은 내용이 이미 있으면 중복으로 건너뜁니다.</label>
          <label className="block"><input type="radio" checked={opts.updateExisting} onChange={() => setOpts({ ...opts, updateExisting: true })} /> <b>기존 데이터 갱신 + 신규 등록</b> — 발주번호·품목번호가 있는 행은 해당 품목의 수량·단가·납기·메모를 수정합니다. <span className="text-slate-500">납품 이력은 바꾸지 않으며, 이미 납품된 수량보다 작게 줄이는 행은 저장 전체를 취소합니다.</span></label>
          {opts.updateExisting && !orderSheets.some((s) => (mappings[s.name] ?? []).includes("orderNo")) && <p className="text-amber-800">◔ 매핑된 '발주번호' 열이 없어 갱신 대상이 없습니다. 목록에서 내려받은 엑셀을 사용하세요.</p>}
          <Nav back={() => setStep(5)} next={() => setStep(7)} />
        </section>
      )}

      {step === 7 && (
        <section className="card space-y-2 p-4 text-[13px]">
          <h2 className="font-semibold">최종 확인</h2>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>파일: <b>{fileName}</b> ({mode === "MIGRATION" ? "최초 데이터 이관" : "일상 등록"})</li>
            <li>시트: {orderSheets.map((s) => `${s.name}→${label.orderType(types[s.name])}`).join(", ")}</li>
            <li>신규 발주 <b>{sum.orders}</b>건 / 품목 <b>{sum.ok + sum.warn}</b>개{sum.update ? <> · 갱신 <b>{sum.update}</b>개</> : null}</li>
            <li>건너뜀(중복) {sum.duplicate - include.size} · 제외 {exclude.size} · 오류 {sum.error} — 모두 원본 행으로 보존</li>
            {customerSheet && <li>거래처 시트 {customerSheet.rows.length}행 반영 (중복은 보충만)</li>}
            <li>저장은 전체가 한 번에 처리되며, 중간에 오류가 나면 아무것도 저장되지 않습니다.</li>
          </ul>
          <div className="rounded bg-amber-50 p-2 text-amber-900">시안에서는 이 브라우저의 테스트 저장소에만 반영됩니다. 운영 DB에는 저장되지 않습니다.</div>
          <div className="flex gap-2 pt-2">
            <button className="btn" onClick={() => setStep(6)}>‹ 이전</button>
            <button className="btn-primary px-6" onClick={save}>저장</button>
          </div>
        </section>
      )}

      {step === 8 && result && (
        <section className="card space-y-2 p-4 text-[13px]">
          <h2 className="text-[15px] font-semibold text-emerald-800">✔ 업로드 완료</h2>
          <p>전체 {result.total}행 → 신규 품목 {result.inserted} · 갱신 {result.updated} · 건너뜀 {result.skipped} · 오류 {result.errors}</p>
          <div className="flex gap-2">
            <Link className="btn-primary" href={`/orders?source=${mode === "MIGRATION" ? "EXCEL_MIGRATION" : "EXCEL_DAILY"}`}>등록된 발주 보기</Link>
            {result.errors > 0 && (
              <button className="btn" onClick={() => exportErrorRows(previews.filter((p) => p.state === "error").map((p) => ({ sheet: p.sheet, rowNo: p.rowNo, raw: p.raw, issues: p.issues.filter((i) => i.level === "error").map((i) => i.msg) })), "업로드_오류행.xlsx")}>⇩ 오류 행 받기</button>
            )}
            <button className="btn" onClick={() => { setStep(1); setSheets([]); setResult(null); setInclude(new Set()); setExclude(new Set()); }}>다른 파일 올리기</button>
          </div>
        </section>
      )}
    </div>
  );
}

function fmt(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function Nav({ back, next, nextDisabled }: { back: () => void; next: () => void; nextDisabled?: boolean }) {
  return (
    <div className="mt-3 flex gap-2">
      <button className="btn" onClick={back}>‹ 이전</button>
      <button className="btn-primary" onClick={next} disabled={nextDisabled}>다음 ›</button>
    </div>
  );
}

function ModeCard({ active, onClick, title, desc, disabled }: { active: boolean; onClick: () => void; title: string; desc: string; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`rounded-lg border p-3 text-left disabled:opacity-50 ${active ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-300 bg-white"}`} aria-pressed={active}>
      <div className="font-semibold">{active ? "◉" : "○"} {title}</div>
      <div className="mt-1 text-[12px] text-slate-600">{desc}</div>
      {disabled && <div className="mt-1 text-[11px] text-red-700">관리자만 사용할 수 있습니다</div>}
    </button>
  );
}

function StateTag({ s }: { s: PreviewRow["state"] }) {
  const m = { ok: ["✔", "정상", "text-emerald-800"], warn: ["◔", "확인", "text-amber-800"], error: ["✕", "오류", "text-red-700 font-semibold"], duplicate: ["⧉", "중복", "text-slate-500"], update: ["↻", "갱신", "text-blue-800"] }[s];
  return <span className={m[2]}>{m[0]} {m[1]}</span>;
}

function UploadHistory() {
  const { db } = useData();
  if (!db.imports.length) return null;
  return (
    <div>
      <div className="lbl">업로드 이력</div>
      <table className="w-full text-[12px]">
        <thead className="bg-slate-50 text-slate-600"><tr><th className="p-1 text-left">일시</th><th className="text-left">작업자</th><th className="text-left">파일</th><th className="text-left">종류</th><th className="text-right">신규</th><th className="text-right">갱신</th><th className="text-right">건너뜀</th><th className="text-right">오류</th></tr></thead>
        <tbody>
          {db.imports.map((b) => (
            <tr key={b.id} className="border-t border-slate-100"><td className="p-1">{b.at.replace("T", " ")}</td><td>{userName(db, b.userId)}</td><td>{b.fileName}</td><td>{b.mode === "MIGRATION" ? "최초 이관" : "일상 등록"}</td><td className="text-right">{b.inserted}</td><td className="text-right">{b.updated}</td><td className="text-right">{b.skipped}</td><td className="text-right">{b.errors}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
