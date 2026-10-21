# KIWON 통합 발주관리 시스템

기원툴스·기원MRO 사내 발주관리 웹 시스템입니다. **GitHub(코드) + Vercel(사이트 주소) + Supabase(공용 DB)** 구성으로,
등록된 직원만 로그인해서 같은 데이터를 실시간으로 함께 봅니다.

| 구성 | 내용 |
|---|---|
| DB | Supabase 프로젝트 `kiwon-order` (서울 리전, 무료 플랜) — 스키마: `supabase/migrations/0001_init.sql` |
| 사이트 | Next.js (Vercel 배포, Root Directory = `kiwon-order`) |
| 로그인 | 이메일 + 비밀번호. **관리자가 등록한 이메일만 가입 가능** (DB에서 차단), 브라우저에 로그인 유지 |
| 실시간 | 다른 직원의 등록·수정·납품 입력이 새로고침 없이 바로 반영 (상단 `● 실시간` 표시) |

현재 DB에는 `[테스트]` 로 시작하는 테스트 발주 6건만 있습니다(`is_test = true`). 실제 엑셀 이관 전에 지웁니다.

## 처음 설정 (한 번만)

### 1. Vercel 연결 → 사이트 주소 만들기
1. https://vercel.com → **Add New → Project** → `UTM-URL-Management` **Import**
2. **Root Directory** → `kiwon-order` 선택 → **Deploy**
3. 첫 배포가 실패하면: **Settings → Git → Production Branch** 를 `claude/exciting-lamport-cttlzx` 로 바꾸고 **Deployments → Redeploy**
   (또는 이 브랜치를 `main` 에 합치면 됩니다)
4. 나온 주소(`https://….vercel.app`)를 메모합니다. 환경변수는 넣지 않아도 됩니다.

### 2. Supabase 로그인 설정 (인증 메일 링크가 사이트로 돌아오게)
Supabase 대시보드 → 프로젝트 `kiwon-order` → **Authentication → URL Configuration**
- **Site URL**: 위 Vercel 주소
- **Redirect URLs**: 같은 주소 추가

### 3. 관리자 첫 로그인
1. 사이트 접속 → **처음 사용하시나요?** → 관리자 이메일(`kiwonmro1@gmail.com`, 이미 관리자로 등록됨)과 새 비밀번호 입력
2. 받은 인증 메일의 링크 클릭 → 로그인
3. **설정·이력 → 직원·권한 → ＋ 직원 등록** 에서 직원 이메일·이름·권한 등록 → 직원에게 "처음 사용하시나요?"로 가입하라고 안내

> Supabase 기본 메일 발송은 시간당 몇 통으로 제한됩니다. 직원 가입 메일이 늦게 오면 잠시 후 다시 시도하거나,
> 회사 메일(SMTP)을 Supabase **Authentication → Emails → SMTP Settings** 에 연결하면 제한이 풀립니다.

## 보안

- 로그인하지 않으면 화면도 데이터도 볼 수 없습니다. 등록되지 않은 이메일은 가입 단계에서 DB가 거부합니다.
- 화면에 노출된 Supabase 키는 공개용(publishable) 키입니다. 데이터 보호는 DB의 RLS 정책과 서버 함수의 권한 검사가 담당합니다.
- 직원은 테이블을 직접 수정·삭제할 수 없고, 정해진 함수로만 저장합니다 (수량·권한·버전 검사 포함).
- 납품이력·수정이력은 삭제할 수 없습니다. 반품·정정은 새 기록으로 남습니다.
- 퇴사·권한 회수: **직원·권한 → 수정 → 사용 중지** 체크 해제 시 즉시 차단.
- 이 저장소(`UTM-URL-Management`)는 **공개 저장소**입니다. 코드에 비밀번호·실데이터는 없지만, 운영 전에 비공개로 바꾸는 것을 권장합니다.

## 백업·복구
- Supabase 무료 플랜은 **7일간 아무도 접속하지 않으면 DB가 일시정지**됩니다(대시보드에서 재개 가능). 매일 쓰면 문제없습니다.
- 무료 플랜은 백업 파일 내려받기가 제공되지 않으므로 **관리자가 주 1회 이상** `목록 → 전체 엑셀` 다운로드로 보관을 권장합니다.
- 유료(Pro, 월 약 $25) 전환 시 매일 자동 백업 + 7일 보관. 운영 데이터가 쌓이면 전환을 권장합니다.
- DB 전체 덤프: Supabase 대시보드 **Database → Backups** 또는 `pg_dump` (관리자).

## 개발

```bash
cd kiwon-order
npm install
npm run dev        # http://localhost:3000 (실제 Supabase DB에 연결됨)
npm test           # 계산 규칙·엑셀 정리 규칙·업로드 묶음 테스트
npm run lint       # 타입 검사
```

| 파일 | 역할 |
|---|---|
| `supabase/migrations/0001_init.sql` | 테이블, RLS, 가입 제한, 서버 함수 (create_order, update_item, add_delivery, void_delivery, import_commit, admin_upsert_user) |
| `src/lib/supabase.ts` | DB 연결, 행 변환 |
| `src/lib/store.tsx` | 데이터 읽기·실시간 반영·저장 함수 |
| `src/components/AuthGate.tsx` | 로그인·가입·비밀번호 재설정 |
| `src/components/Shell.tsx` | 메뉴, 실시간 표시, 납기 알림(🔔) |
| `src/app/*` | 대시보드, 통합 발주목록, 신규 발주, 엑셀 업로드, 거래처, 설정·이력 |
| `src/lib/excel/*` | 엑셀 읽기·정리·검증·저장 묶음·내려받기 |
| `docs/01~03` | 엑셀 분석, 화면 설계, DB 설계 |

## 테스트한 내용
- DB 안에서 직원 권한을 흉내 내어 검증 (테스트 후 전부 롤백, 흔적 없음):
  - 미등록 이메일 가입 차단, 로그인 안 한 사람·미등록 사용자 조회 0건, 조회 전용 등록 차단, 직원의 관리자 기능 차단
  - 테이블 직접 수정·삭제 차단
  - 100개 중 30+40 납품 → 미납 30, 초과 31 차단, 반품·정정 반영, 납품보다 작은 수량 변경 차단
  - 동시수정 충돌 감지(P0409)
  - 엑셀 이관: 거래처 중복 합치기, 같은 파일 재이관 시 번호 겹침 처리, 갱신 실패 시 전체 취소, 4,200행 0.8초
- 화면: DB와 같은 형식의 데이터로 대시보드·목록·상세·납품·충돌 안내·신규 등록·설정 화면 동작 확인
