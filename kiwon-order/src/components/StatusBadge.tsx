import { STATUS_MAP } from "@/lib/status";
import type { StatusCode } from "@/lib/types";

/** 색 + 모양이 다른 기호 + 글자: 색약 사용자도 구분 가능 */
export function StatusBadge({ code, small }: { code: StatusCode; small?: boolean }) {
  const s = STATUS_MAP[code];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 ring-1 ring-inset ${small ? "text-[11px]" : "text-[12px]"} ${s.cls}`}>
      <span aria-hidden className="font-bold no-underline">{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Flag({ kind }: { kind: "overdue" | "soon" | "remain" }) {
  if (kind === "overdue")
    return <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-300 ring-inset">▲ 지연</span>;
  if (kind === "soon")
    return <span className="inline-flex items-center gap-0.5 rounded bg-orange-50 px-1 text-[11px] font-medium text-orange-800 ring-1 ring-orange-300 ring-inset">◷ 임박</span>;
  return <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[11px] text-amber-900 ring-1 ring-amber-300 ring-inset">◔ 미납</span>;
}

export function SourceTag({ source }: { source: string }) {
  if (source === "MANUAL") return <span className="rounded bg-slate-100 px-1 text-[11px] text-slate-600">✎ 직접입력</span>;
  if (source === "EXCEL_MIGRATION") return <span className="rounded bg-stone-100 px-1 text-[11px] text-stone-700">⇪ 엑셀이관</span>;
  return <span className="rounded bg-green-50 px-1 text-[11px] text-green-800">⇪ 엑셀업로드</span>;
}
