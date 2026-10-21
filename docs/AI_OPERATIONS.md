# LearnHub AI 운영 계약

기준일: 2026-09-15

LearnHub는 Google Gemini와 OpenAI GPT를 하나의 서버 gateway에서 사용한다. 사용자는 설정에서 공급자, 모델, 추론 수준, 요청당 최대 출력 토큰을 선택한다. API 키와 실제 비용 한도는 운영자 서버에서만 관리한다.

## 지원 모델

현재 교육용 text/JSON endpoint에서 지원하는 모델은 `src/domain/aiModels.ts`의 단일 allowlist가 기준이다.

- OpenAI: GPT-5.6 Sol, GPT-5.6 Terra, GPT-5.6 Luna
- Gemini stable: 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite
- Gemini preview: 3.1 Pro Preview, 3 Flash Preview

이미지·음성·실시간·embedding·agent 전용 모델은 현재 학습 endpoint가 구조화된 텍스트 JSON을 요구하므로 목록에서 제외한다. Preview 모델은 공급자 정책에 따라 더 짧은 고지 후 변경·종료될 수 있다.

모델 목록을 바꿀 때는 공급자 공식 모델 문서, reasoning 지원값, JSON 출력 지원을 함께 확인하고 allowlist와 테스트를 갱신한다. 사용자가 임의의 model ID를 보낼 수는 없다.

## 공급자 호출

- Gemini는 공식 `@google/genai` SDK의 `models.generateContent`를 사용한다.
- OpenAI는 서버에서 Responses API를 호출하고 `store: false`를 지정한다.
- 두 공급자 모두 endpoint별 schema와 애플리케이션 validation을 통과한 JSON만 반환한다.
- provider 오류 객체, API 키, prompt·사용자 답안 원문은 로그에 남기지 않는다.
- 사용량 로그에는 request ID, endpoint, 공급자, 모델, reasoning 수준, 처리시간, 집계 token 수만 남긴다.

## 추론 수준

- GPT-5.6 계열: `none`, `low`, `medium`, `high`, `xhigh`, `max`
- Gemini 3 계열: 모델별로 `minimal`, `low`, `medium`, `high` 중 공식 지원값만 노출
- Gemini 2.5 계열: UI 수준을 thinking budget으로 변환한다. none=0, low=1,024, medium=8,192, high=24,576이며 2.5 Pro는 none을 허용하지 않는다.

높은 reasoning은 품질을 높일 수 있지만 지연시간과 사용 token이 늘어날 수 있다. Gemini의 `maxOutputTokens`는 생각 token까지 포함하므로 지나치게 낮으면 본문이 잘리거나 비어 있을 수 있다.

## 한도와 할당량

사용자가 선택하는 `maxOutputTokens`는 4,096 / 8,192 / 16,384 중 하나다. 실제 요청에는 이 값과 endpoint 자체 안전 한도 중 작은 값이 적용된다.

운영자 강제 한도는 다음 환경변수로 설정한다.

- `AI_MAX_CONCURRENT`
- `AI_REQUESTS_PER_USER_PER_MINUTE`
- `AI_REQUESTS_PER_USER_PER_DAY`
- `AI_RESERVED_OUTPUT_TOKENS_PER_USER_PER_DAY`
- `AI_GLOBAL_REQUESTS_PER_DAY`
- `AI_GLOBAL_RESERVED_OUTPUT_TOKENS_PER_DAY`

인증된 사용자별 일일 요청·token 한도는 Firestore의 UID별 `aiUsage/{UTC-day}` 문서에서 transaction으로 예약한다. 관리자 운영 기능 도입 이후 전체 일일 한도도 `learnhubOperationsDays/{UTC-day}`의 transaction으로 공유하므로 재시작·다중 인스턴스에 걸쳐 유지된다. 동시성·분당 제한은 서버 프로세스 기준이다. `/admin`에서 생성 중지, 모델 중지, 일일 한도를 변경할 수 있다. 설정과 예약량은 실제 공급자 결제 한도나 청구액을 뜻하지 않는다. 자세한 적용 범위와 검증은 [관리자 운영 가이드](ADMIN_OPERATIONS.md)를 참고한다.

`GET /api/ai/config`는 로그인 사용자에게 다음 정보만 반환한다.

- 공급자별 API 설정 여부
- 허용 모델과 reasoning 수준
- 출력 token 선택지
- 사용자별 분당/일일 한도와 오늘 남은 보수적 예약량

API 키 값, 조직 ID, 결제 정보는 반환하지 않는다.

## 서버 환경

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` (선택. 없으면 Claude 모델은 입력바에 "준비 중"으로 보이고, 저장된 Claude 선택은 서버 기본 모델로 처리된다.)

키는 서버 환경이나 secret manager에만 저장한다. `VITE_` 접두사, 브라우저 localStorage, Firebase 공개 웹 설정, source control에 넣지 않는다. 키 하나가 없으면 그 공급자의 모델은 설정 화면에 “준비 중”으로 표시되고 저장을 막는다. 다른 공급자는 계속 사용할 수 있다.

Claude Haiku 4.5는 출력 한도에 추론 예산을 더해 요청하므로, 게이트웨이의 사용량 제한과 계정의 영구 사용량 예약은 `reservedAiOutputTokens`로 같은 금액을 예약한다. 짧은 설정·추천 요청의 추론 단계 상한도 예약량 계산에 반영한다.

## 공개 전 검증

1. 사용하는 공급자(Gemini, GPT, Claude)의 별도 테스트 키와 결제/usage limit을 확인한다.
2. 같은 학생 질문 세트로 모델별 정확성, 힌트 품질, 오답 교정, 지연시간, 실제 token·비용을 비교한다.
3. 모델별 모든 reasoning 수준에서 과정·레슨·튜터·복습·평가 JSON validation을 통과하는지 확인한다.
4. 429, timeout, invalid JSON, provider 중단 상태에서 사용자 메시지와 fallback을 따로 확인한다.
5. 전체/사용자별 일일 예약은 Firestore에서, 동시성·분당 제한은 프로세스에서 적용됨을 확인한다. 실제 청구 한도와 공급자 설정은 별도로 검증한다.
