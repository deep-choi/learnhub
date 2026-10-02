# LearnHub Firebase 전환

LearnHub는 기존 Firebase 프로젝트 `learnhub-1de94`를 온라인 인증·데이터 저장소로 사용한다. Cloud Functions와 Firestore는 모두 서울 리전 `asia-northeast3`이며, Firestore 기본 DB에는 삭제 보호가 켜져 있다.

이번 전환은 테스트 단계이므로 Supabase 계정·비밀번호·학습 데이터는 옮기지 않는다. 사용자는 Firebase에서 새로 가입해야 하며, 기존 테스트 계정과 기록은 이어지지 않는다. Supabase 프로젝트는 운영 동작 검증이 끝날 때까지 보존한다.

## 현재 구성

- Firebase Authentication: 이메일/비밀번호 및 Google 로그인을 담당한다.
- Firestore: 계정별 학습 snapshot, 신고, AI 사용량을 저장한다.
- Firebase Functions: ID token을 검증한 뒤 Admin SDK로 Firestore를 읽고 쓴다.
- Firestore Security Rules: 브라우저의 직접 읽기·쓰기를 모두 거부한다.
- Firebase Hosting: React 웹 앱과 `/api/**` Functions 라우팅을 제공한다.
- Gemini/OpenAI 비밀키: Functions Secret Manager에만 둔다. 공개 웹 앱 설정은 Firebase 클라이언트 초기화에 필요한 값만 반환한다.

## Google 로그인 준비

Firebase Authentication의 Google provider를 켜려면 서비스 사용자가 볼 수 있는 지원 이메일을 지정해야 한다. 개인 이메일을 공개 지원 주소로 쓰려면 먼저 운영자가 선택해야 하므로 `firebase.json`에는 아직 Google provider를 추가하지 않았다.

지원 이메일이 준비되면 `firebase.json`의 `auth.providers.googleSignIn.supportEmail`을 설정하고 다음을 배포한다.

```powershell
firebase deploy --only auth
```

개발 환경에서 로그인할 때 Firebase Console → Authentication → Settings → Authorized domains에 `localhost`가 있는지 확인한다. 운영 도메인은 `learnhub-1de94.web.app`이다.

로컬 Google 로그인은 모바일 미리보기에서도 팝업으로 처리해 현재 로컬 페이지를 유지한다. 이메일 로그인 링크, 가입 확인 메일의 계속 URL, 비밀번호 재설정의 계속 URL에도 현재 로컬 주소와 포트를 사용한다. Firebase의 메일 작업 화면 자체는 Firebase 도메인에서 열릴 수 있다.

LearnHub 개발 서버의 기본 포트는 Dayflow와 겹치지 않는 3002다:

```powershell
npm run dev
```

확인 주소는 `http://localhost:3002/`이다. 필요하면 `PORT` 환경변수로 포트를 변경할 수 있다. `localhost` 허용 도메인은 포트에 관계없이 적용된다. 운영 서버의 기본 포트는 3000을 유지한다.

## 배포와 확인

```powershell
npm run deploy:firebase
```

이 명령은 Firestore rules, Functions, Hosting을 배포한다. Authentication 설정은 Google 지원 이메일을 정한 뒤 별도로 배포한다. 운영 주소에서 신규 이메일 가입/확인, Google 로그인, 기기 간 cloud snapshot 복원, AI 사용량 저장, 콘텐츠 신고, 계정 삭제를 확인한다. 이 검증 전에는 Supabase 프로젝트를 삭제하지 않는다.

이 Firebase 프로젝트는 Blaze 요금제다. Firestore 기본 DB의 현재 무료 quota를 넘거나 Functions/네트워크 사용량이 무상량을 넘으면 과금될 수 있다. AI 공급자 API 비용은 별도이며, Firebase 예산 알림과 실제 사용량을 확인한다.
