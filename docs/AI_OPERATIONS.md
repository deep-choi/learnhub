# LearnHub AI 운영 계약

## 현재 상태

- AI 공급자 선택은 보류 상태다. LearnHub는 Supabase나 Firebase를 필수로 요구하지 않는다.
- 인증과 신고 저장은 provider-neutral adapter인 `server/auth.ts`와 `server/cloudStore.ts`가 담당한다. 구현이 없거나 설정되지 않으면 fail-closed로 동작한다.
- `GEMINI_API_KEY`가 없을 때도 서버 모듈 import와 정적 UI는 계속 로드되며, AI 요청은 `503`과 `AI_NOT_CONFIGURED`를 반환한다.
- 개발 모드의 인증 미설정 예외는 `localhost`/loopback client에서만 허용된다. 요청 body의 `userId`는 신뢰하지 않으며 허용 필드에도 포함하지 않는다.

## AI gateway 보호

모든 billable Gemini 호출은 `server/aiGateway.ts` 하나를 통과한다.

- 입력 body는 JSON 64KB, endpoint별 허용 필드, 문자열 길이, enum, 배열 크기를 검사한다.
- gateway는 prompt 24,000자와 endpoint별 `maxOutputTokens`를 제한한다.
- `HttpOptions.timeout`과 `GenerateContentConfig.abortSignal`을 사용한다. SDK 타입 문서상 abort는 client-side 취소이며 서비스 작업을 취소하거나 비용을 되돌린다는 뜻이 아니므로, SDK promise가 settle된 뒤에만 concurrency slot을 반환한다.
- `retryOptions.attempts: 1`로 자동 재시도를 끈다. 실패한 billable 요청을 애플리케이션에서 재시도하지 않는다.
- requestId, endpoint, 상태, 경과 시간, `usageMetadata`의 집계 수치만 기록한다. 원문 prompt·답안·provider error object·토큰 값은 로그에 기록하지 않는다.
- 응답 JSON parse 후 curriculum은 `validateCurriculumPayload`, lesson은 `validateLessonPayload`를 통과해야 사용자에게 반환한다.

## admission 한도의 정확한 의미

`server/aiPolicy.ts`의 한도는 process-local 보호장치다.

- global concurrency와 client별 분당 요청 수를 제한한다.
- `dailyOutputTokenBudget`은 실제 청구액이나 전체 usage hard cap이 아니다. 각 요청의 `maxOutputTokens`를 보수적으로 예약하는 “일일 출력 토큰 예약 한도”다. prompt/input token은 이 예약값에 포함되지 않는다.
- 별도로 `dailyRequestBudget`이 있어 일일 요청 수도 제한한다.
- 서버 재시작·다중 인스턴스·다중 리전에 걸쳐 공유되지 않으며, proxy가 전달하는 client IP를 신뢰하지 않는다. 운영 배포 전에는 실제 인증, rate limit store, 비용 모니터링을 별도로 결정해야 한다.
- 유한 양수가 아닌 설정·요청 수치는 거부한다. 오래된 client window를 정리하고 추적 client 수도 bounded로 유지한다.

## 콘텐츠 신고

`POST /api/content-reports`는 bearer 인증과 provider-neutral configured storage가 모두 필요하다. 인증/DB가 준비되지 않은 경우 local draft나 성공 receipt를 만들지 않고 `503`을 반환한다. 현재 공개 admin listing이나 실제 검토 완료 claim은 제공하지 않는다.
