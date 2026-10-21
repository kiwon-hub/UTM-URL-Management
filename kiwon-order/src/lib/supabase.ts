"use client";
import { createClient } from "@supabase/supabase-js";

// 공개용(publishable) 키입니다. 데이터 보호는 DB의 RLS(등록된 직원만 조회)와 서버 함수 권한검사가 담당합니다.
// 다른 DB(테스트/운영 분리 등)에 연결하려면 Vercel 환경변수로 덮어씁니다.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cwbqqibthprokftwlilc.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_ou3C2HH6iupDDFONtDc76A_vW3C1GKU";

export const sb = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "kiwon-order-auth" },
  realtime: { params: { eventsPerSecond: 20 } },
});

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const TS_KEYS = new Set(["at", "created_at", "updated_at"]);

/** 타임스탬프를 한국 시간 'YYYY-MM-DDTHH:mm:ss' 로 */
export function localStamp(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

/** DB 행(snake_case) → 앱 객체(camelCase) */
export function fromRow<T>(r: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) o[camel(k)] = TS_KEYS.has(k) && typeof v === "string" ? localStamp(v) : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && (k === "qty" || k === "cancelled_qty" || k === "unit_price" || k === "last_price") ? Number(v) : v;
  return o as T;
}

/** 앱 패치(camelCase) → DB 패치(snake_case), 빈 문자열은 null */
export function toPatch(p: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) o[snake(k)] = v === "" || v === undefined ? null : v;
  return o;
}

/** 1000행 제한을 넘어 전부 읽기 */
export async function fetchAll<T>(table: string, opts: { select?: string; order?: string; filter?: (q: any) => any } = {}): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(opts.select ?? "*").order(opts.order ?? "id").range(from, from + 999);
    if (opts.filter) q = opts.filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...(data as unknown as Record<string, unknown>[]).map((r) => fromRow<T>(r)));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function errMsg(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (/Failed to fetch|NetworkError/.test(m)) return "네트워크 연결을 확인하세요.";
  if (/JWT|session/i.test(m)) return "로그인이 만료되었습니다. 다시 로그인하세요.";
  return m;
}
