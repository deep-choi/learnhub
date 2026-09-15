# LearnHub Firebase 임시 배포

Firebase 프로젝트: `learnhub-1de94`

임시 공개 주소:

- `https://learnhub-1de94.web.app`
- `https://learnhub-1de94.firebaseapp.com`

## 구조

- Firebase Hosting: `dist`의 React 정적 파일
- Firebase Functions 2세대 `learnhubApi` (`asia-northeast3`, Cloud Run 기반): Express API, Supabase 연결, OpenAI/Gemini 비밀키
- Hosting rewrite: `/api/**`, `/robots.txt`, `/sitemap.xml`만 Functions로 전달
- 나머지 경로: SPA의 `index.html`

Firebase는 데이터베이스나 사용자 인증 원본으로 사용하지 않는다. 기존 Supabase 인증과 account-scoped snapshot을 유지하고, Firebase는 배포 주소와 정적 파일/CDN, Functions 2세대 연결만 담당한다.

## 현재 임시 배포 정책

- `APP_URL=https://learnhub-1de94.web.app`
- `SEO_INDEXABLE=false`
- Hosting 응답에도 `X-Robots-Tag: noindex, nofollow`
- Google Analytics 비활성화
- Firebase 콘솔 Gemini 지원 비활성화

## Functions secret / environment

다음 값은 저장소나 Firebase Hosting 파일에 넣지 않고 Functions secret/environment에만 설정한다.

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- AI quota 환경변수

## 배포 순서

1. Firebase 프로젝트를 Blaze로 업그레이드하고 예산 알림/지출 제한을 설정한다.
2. `firebase functions:secrets:set`으로 `GEMINI_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 등록한다.
3. `functions/.env.learnhub-1de94`에 `APP_URL`, `SEO_INDEXABLE`, AI quota 환경변수를 설정한다.
4. `npm run deploy:firebase`로 Functions와 Hosting을 함께 배포한다.
5. `/api/public-config`, 인증, Gemini/GPT 호출, snapshot 저장/복원, 계정 삭제를 실제 주소에서 확인한다.
6. Supabase Authentication의 Site URL과 Redirect URLs에 `https://learnhub-1de94.web.app/**`를 추가한다.

Blaze 연결은 사용량 기반 결제가 가능한 상태로 바뀌는 작업이므로 운영자 확인 후 수행한다.
