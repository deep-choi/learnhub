# LearnHub

LearnHub는 로그인한 사용자의 학습 과정을 AI가 구성하고, 레슨·연습·복습·평가 기록을 계정에 자동 저장하는 웹 학습 서비스입니다.

## 로컬 실행

요구 사항: Node.js, LearnHub Supabase 프로젝트

```powershell
npm install
npm run dev
```

서버 환경에는 다음 값을 설정합니다.

```text
GEMINI_API_KEY=...
OPENAI_API_KEY=...
APP_URL=https://your-temporary-host.example
SEO_INDEXABLE=false
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
```

secret/service-role key와 OAuth Client Secret은 브라우저 코드나 저장소에 넣지 않습니다.

## 검증

```powershell
npm run lint
npm test
npm run build
```

## 운영 설정

Supabase migration, Google OAuth, 이메일 확인·비밀번호 재설정, 계정 삭제 검증 절차는 [Supabase 운영 준비](docs/SUPABASE_SETUP.md)를 참고하세요. 인증과 자동 동기화의 현재 책임 경계는 [인증·동기화 결정 기록](docs/AUTH_AND_SYNC_DECISIONS.md)에 정리되어 있습니다.

GPT/Gemini 모델, 추론 수준, 요청당 출력 한도와 서버 quota 설정은 [AI 운영 가이드](docs/AI_OPERATIONS.md)를 참고하세요. 브라우저에는 API key를 전달하지 않으며, 사용자가 고른 설정만 계정 snapshot에 동기화합니다.

회원가입 약관과 개인정보 처리방침을 공개하기 전에 운영자가 확정해야 하는 값은 [법적 운영 정보 체크리스트](docs/LEGAL_INFORMATION_REQUIRED.md)에 정리되어 있습니다.

임시 배포 주소에서는 `SEO_INDEXABLE=false`를 유지합니다. 정식 도메인과 공개 문서가 준비된 뒤 `APP_URL`을 정식 HTTPS 주소로 바꾸고 `SEO_INDEXABLE=true`로 전환하면 canonical, robots, sitemap이 같은 주소를 사용합니다.

Firebase 임시 배포 구조와 Console/Cloud Run 설정 순서는 [Firebase 배포 가이드](docs/FIREBASE_DEPLOY.md)를 참고하세요.
