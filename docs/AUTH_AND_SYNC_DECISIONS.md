# LearnHub 인증·동기화 결정 기록

이 문서는 실제 인증이나 클라우드 동기화의 완료 선언이 아니다. 공급자 선택이 보류된 상태에서, 로컬 학습 데이터를 안전하게 옮길 수 있고 나중에 실제 연동을 주입할 수 있는 경계만 정의한다.

## 현재 결정

- 학습 데이터의 현재 소유자는 사용자의 브라우저 로컬 저장소다.
- 사용자가 버튼을 누를 때만 JSON 백업을 내보내거나 파일을 선택해 가져온다.
- 백업은 명시적인 LearnHub 학습 키 allowlist만 읽는다. `ai_learnhub_user_v2`와 향후 명시적으로 거부한 auth/session/token 계열 키는 포함하지 않는다.
- 다른 앱의 localStorage 키, 인증 정보, 세션, 토큰, provider credential은 백업 대상이 아니다.
- 가져오기는 파일 전체 검증 후에만 시작한다. 미리보기에서 충돌 수를 보여 주고 사용자가 `현재 데이터 유지`, `겹치지 않는 항목만 합치기`, `가져온 데이터로 덮어쓰기` 중 하나를 선택해야 한다.
- 덮어쓰기와 합치기 전에 현재 allowlist 데이터의 안전 백업을 메모리상 결과로 만들며, 쓰기 중 실패하면 기존 allowlist를 best-effort로 롤백한다. `localStorage.clear()`는 사용하지 않는다.

## 책임 경계

| 영역 | 이 foundation의 책임 | 공급자 선택 후 추가될 책임 |
| --- | --- | --- |
| 클라이언트 인증 | `getAccessToken()` / `getAuthStatus()`와 주입 가능한 adapter 계약. 기본은 fail-closed. | 실제 SDK 초기화, 로그인·로그아웃, refresh, redirect/deep link, 사용자 세션 수명 |
| 서버 인증 | 주입된 verifier만 호출하고 `{ id }`를 검증. JWT를 임의 decode하거나 정적 secret으로 흉내 내지 않음. | provider의 토큰 검증, issuer/audience 정책, 사용자 상태·권한 처리 |
| 로컬 snapshot | 알려진 학습 레코드의 JSON export/import, 크기·shape·키 검증, 충돌 미리보기 | 계정별 snapshot ownership, 서버 저장·복원, 암호화·보존 정책 |
| cloud store | 성공적인 실제 persistence adapter가 반환한 receipt만 통과시키는 계약. 기본은 configuration-required 오류. | 데이터 모델, 사용자별 격리, 권한 규칙, 실제 write/read, 감사·삭제 정책 |

## 게스트와 계정 전환

현재 게스트 학습 데이터는 브라우저에 남는다. 실제 계정을 붙일 때는 다음 중 하나를 제품 결정으로 명시해야 한다.

1. 사용자가 로그인한 뒤 “이 기기의 학습 데이터를 계정으로 옮기기”를 확인하면 현재 snapshot을 계정에 한 번 업로드한다.
2. 계정 데이터로 시작하고 로컬 게스트 데이터는 별도 보관한다.
3. 두 데이터를 합칠 경우 레코드 ID·updatedAt·학습 이력의 우선순위를 먼저 정의한다.

자동 guest migration, 자동 삭제, 자동 계정 병합은 이 foundation에 없다. 사용자의 명시적 선택과 취소 가능한 단계가 필요하다.

## 버전·충돌·재시도

- 현재 문서 식별자는 `learnhub.learning-backup`, 버전은 `1`이다. 알 수 없는 필드와 버전은 거부한다.
- 과목·실력·복습·오답 배열은 ID 기준으로 보수적으로 합치며, 같은 ID의 현재 항목을 우선한다. 진도와 메모·캐시·튜터 기록의 충돌도 기본적으로 현재 값을 우선한다.
- overwrite는 미리보기 뒤에만 선택할 수 있다. 기본 선택은 current-preserve다.
- 파일 import 재시도는 같은 파일을 다시 선택해 명시적으로 실행하는 방식이다. 서버 sync를 위한 idempotency key, offline queue, retry/backoff, last-write-wins 정책은 아직 정의하거나 구현하지 않았다.
- 향후 서버 snapshot에는 schema version, snapshot ID, owner ID, revision/updatedAt, idempotency key, retryable/non-retryable 오류 구분이 필요하다.

## 현재 allowlist와 향후 필요한 설정 이름

백업이 읽는 현재 키는 다음과 같다.

- `ai_learnhub_courses_v2`
- `ai_learnhub_skills_v2`
- `ai_learnhub_progress_v2`
- `ai_learnhub_reviews_v2`
- `ai_learnhub_mistakes_v2`
- `ai_learnhub_quiz_attempts_v2`
- `ai_learnhub_lessons_cache_v2_` 접두사
- `learnhub_note_` / `learnhub_scratchpad_` / `learnhub_tutor_history_` 접두사

실제 provider를 고른 뒤 필요한 설정은 값이 아니라 이름과 책임부터 합의해야 한다. 예시는 `auth provider client identifier`, `auth issuer/audience`, `server verifier configuration`, `cloud project/database identifier`, `redirect URI`, `allowed origin`, `snapshot schema version`이다. 이 파일에는 secret 값, `.env` 값, token, provider 이름을 기록하지 않는다.

## 아직 구현하지 않은 것

- Firebase, Supabase 또는 다른 vendor 선택·SDK 설치·초기화
- 실제 로그인/회원가입/로그아웃, refresh token, session persistence
- 사용자별 cloud read/write, realtime sync, offline queue, conflict resolver, retry worker
- 서버 route wiring 및 `server.ts` 변경
- 계정 간 guest migration, 복구, 삭제, export encryption
- 브라우저·실기기·배포 환경에서의 인증/동기화 검증

따라서 현재 상태는 “휴대 가능한 사용자 주도 백업과 인터페이스 경계가 준비됨”이지, 실제 인증·계정 복원·클라우드 동기화가 준비되었다는 뜻이 아니다.
