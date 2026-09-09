# LearnHub Supabase 준비 문서

## 서비스 운영 원칙

LearnHub는 실제 고객이 사용하는 계정 기반 서비스다. 공개 소개 화면을 제외한 학습·AI·기록 기능은 인증된 사용자만 이용한다. Supabase의 사용자별 데이터가 원본이며, 브라우저 저장소는 화면 복원과 장애 대응을 위한 캐시로만 사용한다. 서로 다른 고객의 캐시가 섞이지 않도록 로그인 시 계정 데이터 로드, 로그아웃 후 접근 차단, 계정 전환 시 소유자 확인을 지켜야 한다.

현재 `learning_snapshots` 구현은 계정별 RLS와 revision 충돌을 제공하지만 수동 저장·복원 중심의 초기 구조다. 자동 동기화, 계정 전환 시 캐시 교체, 데이터 삭제·보존 정책까지 구현되기 전에는 공개 출시 준비 완료로 보지 않는다.

## 현재 readiness (2026-09-09)

- Supabase provider 구현과 SQL migration 파일이 준비되어 있다.
- `supabase/migrations/20260909_learnhub_initial.sql`의 동등한 SQL이 새 LearnHub 프로젝트 `rfyaulzkzxuvyejxbecz`에 2026-09-09 실제 적용되었고, 스키마 생성이 성공했다.
- 대상 DB가 새 프로젝트라 기존 public table/policy가 없었으므로 적용 시 `DROP POLICY`와 `CREATE OR REPLACE FUNCTION` 대신 동등한 `CREATE` 경로를 사용했다. 데이터 삭제는 없었다.
- 양 테이블 모두 `relrowsecurity=true`, `relforcerowsecurity=true`를 live catalog에서 확인했다. `anon` SELECT와 `authenticated` TRUNCATE도 허용되지 않음을 확인했다.
- 새 서버가 3000번 포트에서 재시작되었고, `GET /api/public-config`는 기대한 프로젝트의 public config로 200을 반환했다. 비인증 snapshot GET은 401을 반환했다.
- 백엔드 테스트/lint는 통합 중간 기준 57개 통과 상태다.
- 실제 사용자 로그인, 실제 bearer 검증, 브라우저·모바일 실사용 검증은 아직 완료되지 않았다.

## 필요한 설정

서버에 다음 환경변수만 설정한다.

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_`로 시작하는 공개 키)

service-role key, secret key, JWT secret은 필요하지 않으며 코드에 넣지 않는다. `/api/public-config`는 설정이 유효할 때만 이 두 공개 값 중 URL과 publishable key를 반환한다. secret/service-role prefix가 들어오면 설정되지 않은 것으로 fail-closed 한다.

개발 서버는 기존 환경 파일을 먼저 읽고 `.env.supabase`를 override 없이 추가로 읽는다. 파일 값이나 토큰을 로그로 출력하지 않는다.

## Google 로그인과 이메일 회원가입

앱에는 Google OAuth, 이메일·비밀번호 회원가입/로그인, 이메일 매직 링크 UI가 연결되어 있다. 실제 Google 로그인 사용 전에는 외부 콘솔 설정이 필요하다.

### 현재 콘솔 상태 (2026-09-10)

- Supabase의 신규 가입 허용: 활성화
- 이메일 Provider: 활성화
- 이메일 확인: 활성화
- Google Provider: 비활성화
- Site URL: `http://localhost:3000`
- Redirect URLs: 등록된 주소 없음
- Google Cloud에는 LearnHub 전용 프로젝트가 없으며 다른 제품의 프로젝트를 재사용하지 않는다.

1. Google Cloud Console의 Google Auth Platform에서 Web application OAuth client를 만든다.
2. Authorized JavaScript origins에 개발 주소 `http://localhost:3000`과 실제 서비스 origin을 등록한다.
3. Authorized redirect URIs에는 Supabase가 안내하는 callback URL을 정확히 등록한다. 현재 프로젝트 기준 URL은 `https://rfyaulzkzxuvyejxbecz.supabase.co/auth/v1/callback`이다.
4. Supabase Dashboard의 Authentication > Providers > Google에서 provider를 활성화하고 Google Client ID와 Client Secret을 입력한다. Secret은 코드나 로컬 문서에 저장하지 않는다.
5. Supabase Dashboard의 Authentication > URL Configuration에서 실제 Site URL을 지정하고 Redirect URLs에 `http://localhost:3000/**` 및 실제 서비스 주소를 추가한다.
6. 이메일 회원가입의 확인 메일 사용 여부와 메일 템플릿은 Supabase Authentication 설정에서 운영 정책에 맞게 정한다.

Google 로그인 후 앱은 현재 origin으로 돌아오며, Supabase 세션의 사용자 ID·이메일·표시 이름을 LearnHub 계정 화면에 반영한다.

## 인증과 저장 경계

`server/auth.ts`는 Supabase `auth.getUser(token)` 결과에서 확인된 사용자 ID만 사용한다. PostgREST와 RPC 요청은 매 요청마다 동일 bearer token을 넣은 Supabase client를 새로 만들어 호출한다. 전역 client에 사용자 token을 바꾸어 넣지 않는다.

`POST /api/content-reports`는 인증된 사용자의 RLS insert가 실제 성공한 경우에만 `{ id, status: "received" }`를 반환한다. 인증 또는 저장 설정이 없으면 local pretend receipt 없이 실패한다.

`GET /api/learning-snapshot`은 인증된 사용자의 snapshot만 읽는다. `PUT /api/learning-snapshot`은 다음 형식이다.

```json
{
  "snapshot": "LearnHub portable backup document",
  "expectedRevision": 1
}
```

첫 저장은 `expectedRevision: null`로 revision 1을 만들고, 이후에는 일치하는 revision일 때만 원자적으로 revision을 증가시킨다. 다른 기기에서 먼저 저장했거나 이미 초기화된 row에 null로 다시 만들면 409 conflict다. snapshot은 portable backup schema/version/data object와 8MB 제한을 서버와 DB 양쪽에서 검사한다.

## SQL 적용 후 확인

SQL 적용 후 다음을 확인한다. 2026-09-09에는 테이블 생성과 RLS/권한 카탈로그, 비로그인 API 차단을 확인했다. 아래 실제 계정 동작과 동시 저장 검사는 아직 수행하지 않았다.

1. `learning_snapshots`와 `content_reports`가 생성되고 새 DB에서 초기 row가 0개인지 확인
2. 두 테이블에 RLS가 enable/force이고, authenticated owner만 자신의 row를 읽거나 쓸 수 있는지 확인
3. anon 및 authenticated의 불필요한 table 권한과 RPC public/anon 권한이 없는지 확인
4. 같은 사용자로 revision 1을 두 번 동시에 저장해 한 번만 성공하고 다른 요청이 409인지 확인
5. 다른 사용자 bearer로 상대 snapshot/report가 보이지 않는지 확인

현재 완료된 것은 schema/RLS catalog와 endpoint 경계 확인이다. 실제 계정 로그인, 실제 snapshot 저장·복원, 계정 간 동기화 성공은 아직 확인하지 않았다.

## 의도적인 한계

snapshot은 현재 휴대 가능한 local backup을 계정에 연결하는 초기 bridge다. 과목·레슨·문항·시도 기록을 정규화한 최종 relational architecture가 아니다. 이후 실제 사용량과 충돌 사례를 확인한 뒤 relational tables, migration policy, retention/deletion, offline queue, retry/idempotency를 별도 결정한다.

현재 provider와 snapshot API는 단일 요청의 인증·RLS·revision conflict를 다루지만, 다중 인스턴스 rate limit, background retry worker, 자동 guest merge, realtime sync, 브라우저·모바일 실기기 검증은 아직 제공하지 않는다.
