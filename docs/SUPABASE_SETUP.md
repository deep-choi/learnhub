# LearnHub Supabase 운영 준비

## 운영 원칙

LearnHub는 인증된 사용자의 Supabase snapshot을 원본으로 사용하는 온라인 서비스다. 브라우저 저장소는 로그인 중인 계정의 임시 캐시일 뿐이며, 로그인 전·동기화 실패 상태에서는 학습 기능을 열지 않는다.

## 서버 설정

서버에는 다음 공개 설정만 둔다.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_`로 시작하는 공개 키)

service-role key, secret key, JWT secret은 앱 서버나 브라우저에 필요하지 않다. `/api/public-config`는 URL과 publishable key만 반환하며 secret/service-role 형식은 fail-closed로 거부한다.

## DB migration

기본 테이블·RLS·revision 함수는 다음 파일에 있다.

- `supabase/migrations/20260909_learnhub_initial.sql`
- `supabase/migrations/20260915_delete_my_account.sql`
- `supabase/migrations/20260915_ai_daily_quota.sql`
- `supabase/migrations/20260917_fix_ai_daily_quota_reservation.sql` (기존 운영 DB에 1회 적용)

두 번째 migration은 사용자가 설정 화면에서 본인의 계정을 삭제할 때 호출하는 `delete_my_account()` RPC를 만든다. 이 함수는 인증된 `auth.uid()` 본인만 삭제하며, 관련 학습 snapshot과 신고 기록은 외래 키 cascade로 함께 삭제된다.

세 번째 migration은 인증된 계정별 AI 요청·예약 token을 하루 단위로 원자적으로 기록한다. `ai_quota_policy`의 초기값은 하루 100회·100,000 예약 output token이며, `reserve_ai_daily_usage()`와 `get_ai_daily_usage()`만 인증된 사용자에게 공개된다.

기존 운영 DB에서 `reserve_ai_daily_usage()`가 `usage_day` ambiguous 오류를 내면 네 번째 migration을 Supabase SQL Editor에서 1회 실행한다. 이 함수는 primary-key constraint를 사용해 출력 컬럼명과 충돌하지 않도록 고친 버전이다.

2026-09-15 LearnHub 원격 프로젝트에 이 migration을 실행했고 SQL Editor의 `Success. No rows returned` 결과를 확인했다. 다른 Supabase 프로젝트나 새 환경에 적용할 때는 다음 순서를 사용한다.

1. Supabase Dashboard에서 LearnHub 프로젝트를 연다.
2. 왼쪽 메뉴의 **SQL Editor**를 열고 **New query**를 누른다.
3. `supabase/migrations/20260915_delete_my_account.sql` 전체 내용을 붙여 넣는다.
4. **Run**을 누른다.
5. 새 테스트 계정에서 설정 → 계정 관리 → 회원 탈퇴를 실행한다.
6. Authentication → Users에서 계정이 없어지고 Table Editor의 `learning_snapshots`, `content_reports`에 그 사용자의 행이 남지 않았는지 확인한다.

운영 계정으로 먼저 시험하지 말고, 데이터가 없는 별도 테스트 계정을 사용한다.

## Google OAuth와 redirect

Google 로그인을 공개 환경에서 사용하려면 다음 값을 일치시킨다.

1. Google Cloud Console → Google Auth Platform → Clients에서 LearnHub 전용 Web application client를 만든다.
2. Authorized JavaScript origins에 개발 origin과 실제 서비스 origin을 등록한다.
3. Authorized redirect URIs에 Supabase Dashboard가 표시하는 callback URL을 정확히 등록한다.
4. Supabase Dashboard → Authentication → Sign In / Providers → Google에 Client ID와 Client Secret을 입력한다.
5. Supabase Dashboard → Authentication → URL Configuration에서 실제 Site URL과 허용할 Redirect URLs를 등록한다.

OAuth Client Secret은 코드, `.env` 예시, 문서, 로그에 남기지 않는다. 개발용 callback/origin을 운영 값과 혼동하지 않는다.

## 이메일 인증과 비밀번호 재설정

Supabase Dashboard → Authentication에서 다음을 운영 정책에 맞게 확인한다.

- 이메일 Provider와 신규 가입 허용 여부
- 이메일 확인 필요 여부
- Confirm signup, Reset password 메일 템플릿
- 공개 서비스용 custom SMTP와 발신 domain
- Site URL 및 reset callback을 허용하는 Redirect URLs

Supabase 기본 이메일 전송 제한에 의존한 상태로 공개 출시하지 않는다. 실제 외부 이메일 주소로 가입 확인, 재전송, 비밀번호 재설정, 재로그인을 각각 확인한다.

## snapshot API

- `GET /api/learning-snapshot`: 인증된 사용자의 snapshot만 반환한다.
- `PUT /api/learning-snapshot`: `snapshot`과 `expectedRevision`을 받아 revision이 일치할 때만 저장한다.
- 첫 저장은 `expectedRevision: null`, 이후 저장은 현재 revision을 보낸다.
- snapshot은 문서 식별자/schema/shape와 8MB 제한을 검사한다.
- 인증·DB 저장이 실패하면 로컬 성공 응답을 만들지 않는다.

## 출시 전 실제 검증

1. 신규 이메일 가입 → 확인 메일 → 로그인
2. Google 로그인 → redirect → 세션 복원
3. PC에서 과목/노트/퀴즈 생성 → 로그아웃 → 태블릿 또는 다른 브라우저 로그인 → 동일 데이터 확인
4. 두 기기에서 순차 수정 → 최신 데이터 유지 확인
5. 네트워크 차단 중 수정 시 오류 표시와 재연결 후 저장 확인
6. 비밀번호 재설정 메일 → 새 비밀번호 → 기존/새 비밀번호 로그인 결과 확인
7. 학습 기록 다운로드 JSON 확인
8. 테스트 계정 회원 탈퇴 → Auth 사용자와 연관 DB 행 삭제 확인
9. 서로 다른 두 계정 간 과목·노트·AI 대화 기록이 노출되지 않는지 확인

코드의 lint/test/build 통과와 위의 실제 인증·다기기 검증은 별개의 증거다.

## 현재 구조의 한계

현재 snapshot은 계정 데이터를 한 문서로 동기화하는 구조다. 오프라인 큐, 실시간 multi-device editing, background retry, 세밀한 레코드별 충돌 해결은 제공하지 않는다. 사용량과 충돌 사례가 확인되면 과목·레슨·시도 기록을 정규화된 테이블로 분리한다.
