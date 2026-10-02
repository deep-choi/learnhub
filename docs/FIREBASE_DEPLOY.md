# LearnHub Firebase 임시 배포

Firebase 프로젝트: `learnhub-1de94`

임시 공개 주소:

- `https://learnhub-1de94.web.app`
- `https://learnhub-1de94.firebaseapp.com`

## 구조

- Firebase Hosting: `dist`의 React 정적 파일
- Firebase Authentication: 이메일/비밀번호와 Google 로그인
- Cloud Firestore 기본 DB (`asia-northeast3`): 계정별 학습 기록, 신고, AI quota
- Firebase Functions 2세대 `learnhubApi` (`asia-northeast3`, Cloud Run 기반): Express API, Firebase Admin SDK, OpenAI/Gemini 비밀키
- Hosting rewrite: `/api/**`, `/robots.txt`, `/sitemap.xml`만 Functions로 전달
- 나머지 경로: SPA의 `index.html`

Firebase Authentication과 Firestore가 온라인 계정·데이터 원본이다. 브라우저의 Firestore 직접 접근은 rules로 차단하고, 인증된 Functions API만 Admin SDK로 사용자별 데이터를 처리한다.

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
- `ANTHROPIC_API_KEY` (Claude를 켤 때만. secret을 등록한 뒤 `functions/index.cjs`의 `secrets`에 `defineSecret("ANTHROPIC_API_KEY")`를 추가한다. 등록 전에 추가하면 배포가 실패한다.)
- AI quota 환경변수

## 배포 순서

1. Firebase 프로젝트를 Blaze로 업그레이드하고 예산 알림/지출 제한을 설정한다.
2. `firebase functions:secrets:set`으로 `GEMINI_API_KEY`, `OPENAI_API_KEY`를 등록한다.
3. `functions/.env.learnhub-1de94`에 `APP_URL`, `SEO_INDEXABLE`, AI quota 환경변수를 설정한다.
4. `npm run deploy:firebase`로 Functions와 Hosting을 함께 배포한다.
5. Authentication 설정을 배포한 뒤 `/api/public-config`, 이메일/Google 인증, Gemini/GPT 호출, snapshot 저장/복원, 계정 삭제를 실제 주소에서 확인한다.
6. Firebase Authentication의 Authorized domains에 `learnhub-1de94.web.app`과 개발용 `localhost`를 확인한다.

Blaze 연결은 사용량 기반 결제가 가능한 상태로 바뀌는 작업이므로 운영자 확인 후 수행한다.
