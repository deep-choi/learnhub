# 중단된 작업 인수인계 결과 (2026-10-02)

현재 브랜치: `feat/chat-first-learning-coach`. 기존 coder 1·coder 2·UX/PM의 변경을 보존한 상태에서 Codex가 남은 연결 작업을 완료했다. 커밋·푸시·운영 배포는 하지 않았다.

## 합친 변경

- 별도 Claude 제공자 브랜치의 `86e796f` 변경을 현재 작업 폴더에 적용했다. Claude → GPT → Gemini로 모델을 묶으며 설명 문구는 제거하고, 키 없는 제공자는 준비 중으로 표시한다.
- 페르소나 편집은 이름·역할·말투·답변 길이·성격·이미지를 하나의 `TutorPersona`로 저장한다. 화면 전용 mock인 `personaExtras.ts`는 제거했다. 역할·말투는 AI 요청, 백업, 동기화에도 포함된다. 검증 실패 시 다른 항목도 부분 저장되지 않는다.
- 이미지 편집창과 페르소나 편집창의 Tab 순환에서 숨긴 파일 입력과 마우스 전용 버튼을 제외했다. 이미지가 로딩 중일 때도 닫기 버튼에 처음 포커스를 준다.
- AI 답은 카드 테두리·배경 없이 왼쪽 정렬하며, 사이드바 펼치기 버튼은 로고 아래에 둔다.
- Haiku의 추론 토큰을 게이트웨이와 계정 사용량 예약에 함께 반영했다. 설정·다음 학습 추천의 추론 단계 상한도 같은 계산을 쓴다.

## 검증

- `npm run lint`: 통과.
- `npm test`: 223개 통과, 실패 0개.
- `npm run build`, `npm run build:functions`: 통과. Vite의 기존 큰 번들 안내는 남아 있다.
- `git diff --check`: 통과.
- 브라우저: 편집창 레이아웃, 역할·말투 저장과 프로필 반영, 잘못된 역할 입력 거절, 새로고침 후 값 복원, 사이드바 상단 펼치기 버튼 확인. 검증용 이름·역할·말투는 원래 값으로 복원했다.
- 이미지 자르기·인코딩은 기존 자동 테스트가 통과했다. 새 이미지 편집창의 실제 파일 업로드·손잡이 드래그와 모바일·다크 화면은 이번 인수인계에서 직접 확인하지 않았다.
- `claude update`: 이미 최신 `2.1.287`. 기존 터미널 세션은 종료하지 않았다.
- 개발 서버를 새 코드로 재시작했다: `http://localhost:3002/`.

## 남은 외부 설정과 실사용 확인

- 현재 로컬 `/api/public-config`: Gemini·GPT 설정됨, Claude 설정 안 됨. Claude 실응답은 검증하지 않았다.
- 로컬 Claude를 활성화하려면 루트 `.env`에 `ANTHROPIC_API_KEY`를 설정하고 개발 서버를 재시작한다. 키는 브라우저나 Git에 넣지 않는다.
- Firebase 운영에서 활성화하려면 `firebase functions:secrets:set ANTHROPIC_API_KEY --project learnhub-1de94`로 secret을 등록한 뒤 `functions/index.cjs`에 `defineSecret("ANTHROPIC_API_KEY")`를 선언하고 `secrets` 배열에 포함한다. 이 파일은 현재 Gemini·GPT secret만 사용한다. 이후 별도 운영 배포와 모델별 실응답 검증이 필요하다.
- 신규 계정 가입·Google 로그인·학습 완료·다른 기기 복원 등 서비스 전체 E2E를 이번 검증 결과로 간주하지 않는다.

Claude 요청 형식은 [구조화 출력](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [추론 단계](https://platform.claude.com/docs/en/build-with-claude/effort), [거절과 fallback](https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback) 공식 문서를 대조했다. API 키가 없어 실제 계정의 모델·베타 사용 권한은 미확인이다.
