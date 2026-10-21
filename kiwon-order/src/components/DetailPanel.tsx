"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { netDelivered, todayStr } from "@/lib/calc";
import { label, STATUSES } from "@/lib/status";
import { useData, userName, type SaveResult } from "@/lib/store";
import type { Order, OrderItem, StatusCode } from "@/lib/types";
import { Flag, SourceTag, StatusBadge } from "./StatusBadge";

const money = (v: number | null, cur: string) => (v === null ? "—" : cur === "KRW" ? v.toLocaleString() + "원" : `${cur} ${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

export function DetailPanel({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { db, rows, can, updateItem, updateOrder, addDelivery, voidDelivery, simulateOtherEdit } = useData();
  const row = rows.find((r) => r.item.id === itemId);
  const [tab, setTab] = useState<"delivery" | "items" | "history" | "source">("delivery");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [conflict, setConflict] = useState<Order | null>(null);
  // 패널을 연 시점의 버전 — 저장 시 비교해 다른 사람 수정 여부를 판단
  const [openedVersion, setOpenedVersion] = useState<number>(row?.order.version ?? 0);
  const [draft, setDraft] = useState<Partial<OrderItem>>({});
  const [dl, setDl] = useState({ kind: "DELIVERY" as "DELIVERY" | "RETURN", qty: "", date: todayStr(), memo: "" });

  useEffect(() => {
    setOpenedVersion(rows.find((r) => r.item.id === itemId)?.order.version ?? 0);
    setDraft({});
    setMsg(null);
    setConflict(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const deliveries = useMemo(() => db.deliveries.filter((d) => d.itemId === itemId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [db.deliveries, itemId]);
  const voided = new Set(deliveries.filter((d) => d.kind === "VOID").map((d) => d.voidsId));
  if (!row) return null;
  const { order, item } = row;
  const editable = can("edit", order.division);
  const siblings = rows.filter((r) => r.order.id === order.id).sort((a, b) => a.item.lineNo - b.item.lineNo);
  const audits = db.audits.filter((a) => a.orderId === order.id);
  const legacy = db.legacyRows.find((l) => l.itemId === item.id);
  const un = (id?: string) => userName(db, id);

  const handle = (r: SaveResult, okText: string) => {
    if (r.ok) {
      setMsg({ tone: "ok", text: okText });
      setOpenedVersion(order.version + 1);
      setDraft({});
      setConflict(null);
    } else if (r.conflict) {
      setConflict(r.current);
      setMsg({ tone: "err", text: "다른 직원이 먼저 이 발주를 수정했습니다. 최신 내용을 확인한 뒤 다시 저장하세요." });
    } else setMsg({ tone: "err", text: r.message });
  };

  const saveDraft = () => handle(updateItem(item.id, draft, openedVersion), "저장했습니다.");
  const setStatus = (s: StatusCode) => handle(updateItem(item.id, { status: s }, openedVersion), "상태를 변경했습니다.");
  const val = <K extends keyof OrderItem>(k: K) => (k in draft ? draft[k] : item[k]) as OrderItem[K];

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[560px] flex-col border-l border-slate-300 bg-white shadow-2xl" aria-label="발주 상세">
      <div className="flex items-start gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] font-semibold">{order.orderNo}</span>
            <span className="text-slate-400">#{item.lineNo}</span>
            <StatusBadge code={row.effectiveStatus} />
            {row.overdue && <Flag kind="overdue" />}
            {row.dueSoon && <Flag kind="soon" />}
            <SourceTag source={order.source} />
          </div>
          <div className="mt-1 truncate text-[15px] font-bold">{order.customerName}</div>
          <div className="truncate text-slate-600">{item.productName} {item.spec}</div>
        </div>
        <button className="btn" onClick={onClose} aria-label="닫기">✕</button>
      </div>

      <div className="overflow-y-auto">
        {msg && (
          <div role="status" className={`mx-4 mt-3 rounded px-3 py-2 text-[13px] ${msg.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
            {msg.tone === "ok" ? "✔ " : "⚠ "}
            {msg.text}
            {conflict && (
              <div className="mt-2 rounded border border-red-200 bg-white p-2 text-[12px] text-slate-700">
                <div>최신 버전: v{conflict.version} · {un(conflict.updatedBy)} · {conflict.updatedAt.replace("T", " ")}</div>
                <div className="mt-1 text-slate-500">내가 입력하던 값: {Object.keys(draft).length ? JSON.stringify(draft) : "(상태 변경)"}</div>
                <button className="btn mt-2 h-7" onClick={() => { setOpenedVersion(conflict.version); setConflict(null); setMsg({ tone: "ok", text: "최신 내용을 불러왔습니다. 입력값은 유지되어 있으니 확인 후 다시 저장하세요." }); }}>
                  최신 내용 불러오기
                </button>
              </div>
            )}
          </div>
        )}

        <dl className="grid grid-cols-3 gap-x-3 gap-y-2 px-4 py-3 text-[13px]">
          <Info k="발주수량" v={`${item.qty} ${item.unit ?? ""}`} />
          <Info k="누적 납품" v={String(row.delivered)} />
          <Info k="잔여 미납" v={<b className={row.remaining > 0 ? "text-amber-800" : ""}>{row.remaining}</b>} />
          <Info k="단가" v={money(item.unitPrice, item.currency) + (item.priceNote ? ` (${item.priceNote})` : "")} />
          <Info k="금액" v={money(row.amount, item.currency)} />
          <Info k="납기" v={item.dueDate ?? order.dueDate ?? "—"} />
          <Info k="발주일" v={order.orderDate} />
          <Info k="사업부/구분" v={`${label.division(order.division)} · ${label.orderType(order.orderType)}`} />
          <Info k="주문경로" v={label.channel(order.channel) + (order.requester ? ` · 발주자 ${order.requester}` : "")} />
          <Info k="발주 담당" v={un(order.assigneeId) || "—"} />
          <Info k="품목 담당" v={un(item.assigneeId) || "—"} />
          <Info k="제작/매입처" v={item.supplier ?? "—"} />
          {item.attrs && Object.entries(item.attrs).filter(([, v]) => v).map(([k, v]) => <Info key={k} k={k} v={v} />)}
        </dl>

        {editable && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="lbl">진행상태 변경 <span className="font-normal text-slate-400">(부분납품·납품완료는 납품 등록 시 자동)</span></div>
            <div className="flex flex-wrap gap-1">
              {STATUSES.filter((s) => !["PARTIAL", "DELIVERED"].includes(s.code)).map((s) => (
                <button key={s.code} onClick={() => setStatus(s.code)} className={`rounded ring-1 ring-inset ${item.status === s.code ? "ring-2 ring-blue-500" : ""}`} aria-pressed={item.status === s.code}>
                  <StatusBadge code={s.code} />
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label>
                <span className="lbl">품목 담당자</span>
                <select className="inp w-full" value={val("assigneeId") ?? ""} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value || undefined })}>
                  <option value="">(발주 담당과 같음)</option>
                  {db.users.filter((u) => u.role !== "VIEWER").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label>
                <span className="lbl">품목 납기일</span>
                <input type="date" className="inp w-full" value={val("dueDate") ?? ""} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || undefined })} />
              </label>
              <label>
                <span className="lbl">발주수량 (변경 시 이력 기록)</span>
                <input type="number" min={1} className="inp w-full text-right" value={val("qty")} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
              </label>
              <label>
                <span className="lbl">마감(미납 취소) 수량</span>
                <input type="number" min={0} className="inp w-full text-right" value={val("cancelledQty")} onChange={(e) => setDraft({ ...draft, cancelledQty: Number(e.target.value) })} />
              </label>
              <label className="col-span-2">
                <span className="lbl">일정/진행 메모</span>
                <input className="inp w-full" value={val("memo") ?? ""} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button className="btn-primary" disabled={!Object.keys(draft).length} onClick={saveDraft}>변경 저장</button>
              {Object.keys(draft).length > 0 && <button className="btn" onClick={() => setDraft({})}>되돌리기</button>}
              <span className="ml-auto text-[11px] text-slate-400">v{order.version} · 마지막 수정 {un(order.updatedBy)}</span>
            </div>
            <button className="mt-2 text-[11px] text-slate-400 underline" onClick={() => simulateOtherEdit(order.id)}>
              [시연] 다른 직원이 동시에 수정한 상황 만들기
            </button>
          </div>
        )}

        <div className="sticky top-0 z-10 flex border-y border-slate-200 bg-slate-50 px-2" role="tablist">
          {([["delivery", `납품이력 (${deliveries.length})`], ["items", `같은 발주 품목 (${siblings.length})`], ["history", `수정이력 (${audits.length})`], ["source", "등록 출처"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] ${tab === k ? "border-b-2 border-blue-600 font-semibold text-blue-800" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "delivery" && (
          <div className="px-4 py-3">
            {editable && item.status !== "CANCELLED" && (
              <form
                className="mb-3 flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = addDelivery(item.id, dl.kind, Number(dl.qty), dl.date, dl.memo || undefined);
                  handle(r, dl.kind === "DELIVERY" ? `${dl.qty}개 납품을 등록했습니다.` : `${dl.qty}개 반품을 등록했습니다.`);
                  if (r.ok) setDl({ ...dl, qty: "", memo: "" });
                }}
              >
                <select className="inp" value={dl.kind} onChange={(e) => setDl({ ...dl, kind: e.target.value as "DELIVERY" | "RETURN" })} aria-label="구분">
                  <option value="DELIVERY">납품</option>
                  <option value="RETURN">반품</option>
                </select>
                <input className="inp w-24 text-right" type="number" min={1} max={dl.kind === "DELIVERY" ? row.remaining : row.delivered} placeholder={dl.kind === "DELIVERY" ? `최대 ${row.remaining}` : `최대 ${row.delivered}`} value={dl.qty} onChange={(e) => setDl({ ...dl, qty: e.target.value })} aria-label="수량" required />
                <input className="inp w-36" type="date" value={dl.date} onChange={(e) => setDl({ ...dl, date: e.target.value })} aria-label="날짜" required />
                <input className="inp min-w-0 flex-1" placeholder="메모 (택배·송장 등)" value={dl.memo} onChange={(e) => setDl({ ...dl, memo: e.target.value })} aria-label="메모" />
                <button className="btn-primary" type="submit">등록</button>
              </form>
            )}
            <table className="w-full text-[13px]">
              <thead className="text-[12px] text-slate-500">
                <tr>
                  <th className="py-1 text-left">날짜</th>
                  <th className="text-left">구분</th>
                  <th className="text-right">수량</th>
                  <th className="pl-3 text-left">처리자</th>
                  <th className="text-left">메모</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const isVoided = voided.has(d.id);
                  return (
                    <tr key={d.id} className={`border-t border-slate-100 ${isVoided || d.kind === "VOID" ? "text-slate-400" : ""}`}>
                      <td className="py-1">{d.date}</td>
                      <td>
                        {d.kind === "DELIVERY" ? <span className="text-emerald-800">▼ 납품</span> : d.kind === "RETURN" ? <span className="text-red-700">▲ 반품</span> : <span>⊘ 정정</span>}
                        {isVoided && <span className="ml-1 text-[11px]">(무효)</span>}
                      </td>
                      <td className={`text-right ${isVoided ? "line-through" : ""}`}>{d.kind === "RETURN" ? "-" : d.kind === "VOID" ? "±" : "+"}{d.qty}</td>
                      <td className="pl-3">{un(d.handlerId)}</td>
                      <td className="max-w-[160px] truncate" title={d.memo}>{d.memo}</td>
                      <td className="text-right">
                        {editable && d.kind !== "VOID" && !isVoided && (
                          <button
                            className="text-[12px] text-slate-500 underline"
                            onClick={() => {
                              const reason = prompt("정정(무효) 사유를 입력하세요. 기존 이력은 삭제되지 않고 무효로 표시됩니다.");
                              if (reason !== null) handle(voidDelivery(d.id, reason), "정정 이력을 남겼습니다.");
                            }}
                          >
                            정정
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!deliveries.length && (
                  <tr><td colSpan={6} className="py-4 text-center text-slate-500">아직 납품 이력이 없습니다.</td></tr>
                )}
              </tbody>
              <tfoot className="border-t border-slate-300 font-semibold">
                <tr>
                  <td colSpan={2} className="py-1">유효 납품 합계</td>
                  <td className="text-right">{netDelivered(deliveries)}</td>
                  <td colSpan={3} className="pl-3 text-[12px] font-normal text-slate-500">미납 = {item.qty} − 마감 {item.cancelledQty} − 납품 {row.delivered} = {row.remaining}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {tab === "items" && (
          <ul className="divide-y divide-slate-100 px-4 py-2">
            {siblings.map((s) => (
              <li key={s.item.id} className={`flex items-center gap-2 py-1.5 ${s.item.id === item.id ? "font-semibold" : ""}`}>
                <span className="w-5 text-slate-400">{s.item.lineNo}</span>
                <span className="min-w-0 flex-1 truncate">{s.item.productName} {s.item.spec}</span>
                <StatusBadge code={s.effectiveStatus} small />
                <span className="w-20 text-right text-[12px]">{s.delivered}/{s.item.qty}</span>
                <span className="w-12 text-[12px] text-slate-500">{un(s.item.assigneeId ?? order.assigneeId)}</span>
              </li>
            ))}
            <li className="pt-2">
              <Link className="btn" href={`/orders/new?copy=${order.id}`}>⧉ 이 발주 복사해서 새 발주</Link>
              {editable && (
                <button className="btn ml-1" onClick={() => {
                  const memo = prompt("발주 비고", order.memo ?? "");
                  if (memo !== null) handle(updateOrder(order.id, { memo }, openedVersion), "발주 비고를 저장했습니다.");
                }}>발주 비고 수정</button>
              )}
            </li>
          </ul>
        )}

        {tab === "history" && (
          <ul className="divide-y divide-slate-100 px-4 py-2 text-[12px]">
            {audits.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="text-slate-500">{a.at.replace("T", " ")}</span> · <b>{un(a.userId)}</b> · {a.action === "CREATE" ? "등록" : a.action === "STATUS" ? "상태변경" : a.action === "IMPORT" ? "업로드" : "수정"}
                {a.field && <span> [{a.field}]</span>}
                {(a.before || a.after) && (
                  <div className="text-slate-700">
                    {a.before !== undefined && <span className="text-red-700 line-through">{a.before || "(빈값)"}</span>} → <span className="text-emerald-800">{a.after}</span>
                  </div>
                )}
              </li>
            ))}
            {!audits.length && <li className="py-4 text-center text-slate-500">수정 이력이 없습니다. (시안 초기 데이터)</li>}
          </ul>
        )}

        {tab === "source" && (
          <div className="px-4 py-3 text-[13px]">
            <p>
              <SourceTag source={order.source} /> 등록: {order.createdAt.replace("T", " ")} · {un(order.createdBy)}
            </p>
            {legacy ? (
              <div className="mt-2">
                <div className="text-slate-600">원본: <b>{legacy.sheet}</b> 시트 {legacy.rowNo}행 {legacy.flags.strike !== "none" && "· 취소선"} {legacy.flags.yellow && "· 노란색 행"} {legacy.flags.red && "· 빨간 글씨"}</div>
                <table className="mt-1 w-full text-[12px]">
                  <tbody>
                    {Object.entries(legacy.raw).map(([k, v]) => (
                      <tr key={k} className="border-t border-slate-100"><td className="w-32 py-0.5 text-slate-500">{k}</td><td>{v === null ? "" : String(v)}</td></tr>
                    ))}
                  </tbody>
                </table>
                {legacy.issues.length > 0 && <ul className="mt-2 list-disc pl-4 text-[12px] text-amber-800">{legacy.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              </div>
            ) : (
              <p className="mt-2 text-slate-500">{order.source === "MANUAL" ? "직원이 화면에서 직접 입력한 발주입니다." : "엑셀 업로드 원본 행 정보가 없습니다 (시안 초기 데이터)."}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-slate-500">{k}</dt>
      <dd className="truncate">{v}</dd>
    </div>
  );
}
