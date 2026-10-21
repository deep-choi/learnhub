# LearnHub

LearnHub는 로그인한 사용자의 학습 과정을 AI가 구성하고, 레슨·연습·복습·평가 기록을 계정에 자동 저장하는 웹 학습 서비스입니다.

## 로컬 실행

요구 사항: Node.js, Firebase CLI, Firebase 프로젝트 `learnhub-1de94`

```powershell
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:3002/`에서 열린다. Dayflow의 3000 포트와 함께 사용할 수 있으며, 로컬 Google 로그인은 팝업으로 진행하고 현재 페이지를 유지한다. Firebase Authentication의 허용 도메인에 `localhost`가 등록되어 있어야 한다.

Functions 환경에는 Gemini/OpenAI API 키와 AI 한도를 설정하고, Firebase 웹 앱의 공개 SDK 설정은 `functions/.env.learnhub-1de94`에서 관리합니다. 공개 Firebase 웹 설정 외의 Admin 자격 증명은 브라우저에 넣지 않습니다.

```text
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

secret/service-role key와 OAuth Client Secret은 브라우저 코드나 저장소에 넣지 않습니다.

## 검증

```powershell
npm run lint
npm test
npm run build
```

## 운영 설정

Firebase 로그인 공급자 구성, Firestore 보호 규칙, 배포와 컷오버는 [Firebase 전환 가이드](docs/FIREBASE_MIGRATION.md)와 [Firebase 배포 가이드](docs/FIREBASE_DEPLOY.md)를 참고하세요. 인증과 자동 동기화의 현재 책임 경계는 [인증·동기화 결정 기록](docs/AUTH_AND_SYNC_DECISIONS.md)에 정리되어 있습니다.

GPT/Gemini 모델, 추론 수준, 요청당 출력 한도와 서버 quota 설정은 [AI 운영 가이드](docs/AI_OPERATIONS.md)를 참고하세요. 브라우저에는 API key를 전달하지 않으며, 사용자가 고른 설정만 계정 snapshot에 동기화합니다.

운영자 전용 `/admin`의 권한 부여·사용법·배포 확인은 [관리자 운영 가이드](docs/ADMIN_OPERATIONS.md)를 참고하세요. 결제·환불 탭은 미연동 상태이며, [결제·환불 검토](docs/BILLING_AND_REFUNDS.md)에 연동 범위를 정리했습니다.

회원가입 약관과 개인정보 처리방침을 공개하기 전에 운영자가 확정해야 하는 값은 [법적 운영 정보 체크리스트](docs/LEGAL_INFORMATION_REQUIRED.md)에 정리되어 있습니다.

임시 배포 주소에서는 `SEO_INDEXABLE=false`를 유지합니다. 정식 도메인과 공개 문서가 준비된 뒤 `APP_URL`을 정식 HTTPS 주소로 바꾸고 `SEO_INDEXABLE=true`로 전환하면 canonical, robots, sitemap이 같은 주소를 사용합니다.

Firebase 임시 배포 구조와 Console/Cloud Run 설정 순서는 [Firebase 배포 가이드](docs/FIREBASE_DEPLOY.md)를 참고하세요.
