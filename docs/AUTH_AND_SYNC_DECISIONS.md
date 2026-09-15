# LearnHub 인증·동기화 결정 기록

LearnHub는 계정 기반 온라인 서비스다. Supabase의 사용자별 학습 snapshot을 원본으로 사용하며, 브라우저 `localStorage`는 로그인한 계정의 화면 복원을 위한 임시 캐시로만 사용한다.

## 현재 동작

- 인증이 확인되기 전에는 학습 화면을 열지 않는다.
- 로그인하면 기존 LearnHub 캐시를 먼저 비우고, 해당 사용자의 cloud snapshot을 내려받아 `overwrite` 방식으로 복원한다.
- cloud snapshot이 없는 신규 계정은 빈 학습 데이터로 시작하고 즉시 최초 snapshot을 만든다.
- 학습 데이터가 바뀌면 800ms debounce 후 자동 저장한다.
- revision 충돌이 한 번 발생하면 원격 snapshot을 보수적으로 병합하고 최신 revision으로 한 번 재시도한다.
- 로그아웃·계정 전환 시 사용자 정보와 모든 LearnHub 학습 캐시를 지운다. 다른 앱의 `localStorage` 키와 테마 설정은 건드리지 않는다.
- cloud load가 실패하면 로컬 데이터로 서비스를 계속하는 대신 오류 화면에서 중단한다. 재시도에 성공해야 학습 화면을 사용할 수 있다.

하드코딩된 사용자 과목·통계·복습·오답 seed는 없다. `roadmapData.ts` 같은 추천 학습 주제는 모든 사용자에게 보여 주는 공개 카탈로그이며 개인 학습 기록이 아니다.

## 저장 범위

cloud snapshot에는 다음 사용자 데이터를 포함한다.

- 과목, 실력, 진도, 복습, 오답, 퀴즈 시도
- 레슨 캐시
- 레슨 노트와 스크래치패드
- AI 튜터 대화 기록
- 연습 답안
- 과정 종료 평가 세션
- AI 공급자·모델·추론 수준·요청당 출력 한도 설정

인증 세션, access token, provider credential, 사용자 프로필 캐시는 portable snapshot에 포함하지 않는다. 콘텐츠 신고 작성 중 임시 초안과 로컬 분석 이벤트도 계정 전환 때 삭제하며 cloud snapshot으로 보내지 않는다.

## 소유권·보안 경계

- 브라우저는 `GET /api/public-config`가 반환하는 `supabaseUrl`과 공개 publishable key만 사용한다.
- service role key, JWT secret, OAuth client secret은 브라우저 코드나 저장소에 넣지 않는다.
- 서버는 bearer token을 Supabase `auth.getUser()`로 확인한 사용자 ID만 신뢰한다.
- `learning_snapshots`는 RLS와 `user_id = auth.uid()` 조건으로 계정을 격리한다.
- 로컬 캐시에는 `learnhub_cloud_data_owner_v1` 소유자 marker를 두며, 현재 인증 사용자와 다르면 데이터를 채택하지 않는다.

## 계정 기능

- 이메일·비밀번호 회원가입/로그인과 Google OAuth
- 이메일 확인 메일 재전송
- 비밀번호 재설정 메일 및 새 비밀번호 저장
- 사용자 요청에 따른 학습 기록 JSON 다운로드
- 사용자 본인 계정과 연관 데이터 삭제

계정 삭제 migration `supabase/migrations/20260915_delete_my_account.sql`은 2026-09-15 원격 LearnHub Supabase 프로젝트에 적용했다. UI는 RPC 실패를 성공처럼 처리하지 않고 오류를 표시한다.

## 충돌과 장애 처리

- backup 문서 식별자는 `learnhub.learning-backup`, schema version은 `1`이다.
- 배열형 기록은 ID 기준으로 병합하고, 동일 ID 충돌에서는 현재 기기의 값을 우선한다.
- 단일 자동 저장은 revision으로 원자적 충돌을 감지한다.
- 계정이 바뀐 뒤 도착한 이전 요청 응답은 generation/user 검사를 통과하지 못하므로 UI 상태에 반영하지 않는다.

## 의도적으로 아직 없는 것

- 오프라인 편집 큐와 background retry worker
- 여러 기기의 실시간 동시 편집
- 과목·레슨·문항별 정규화된 relational sync
- 같은 레코드를 여러 기기에서 동시에 수정할 때의 사용자 선택형 충돌 해결 UI
- 브라우저·태블릿·모바일 실기기에서 수행한 실제 사용자 E2E 증거

따라서 현재 구현은 “로그인 시 cloud load, 사용 중 자동 저장, 로그아웃 시 캐시 폐기”까지 제공한다. 오프라인 우선 앱이나 Google Docs식 실시간 공동 편집을 의미하지는 않는다.
