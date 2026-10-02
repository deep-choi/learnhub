/**
 * 인증 공급자가 연결되기 전에 먼저 도착하는 로그인 상태 이벤트인지 판별합니다.
 *
 * Firebase의 onAuthStateChanged(SIGNED_IN/SIGNED_OUT)는 어댑터가 등록되기 전에 먼저 도착할 수 있고,
 * 이때 getAuthStatus()는 "로그아웃"으로 읽힙니다. 그대로 처리하면 첫 화면이 비로그인 상태로 열렸다가
 * 곧이어 오는 INITIAL_SESSION에서 학습 기록을 다시 불러오며 화면이 갈아엎어져, 그 사이의 첫 클릭이 사라집니다.
 * 연결 전 이벤트는 무시하고, 연결 뒤 INITIAL_SESSION 한 번으로만 상태를 정합니다.
 * (설정 오류·비밀번호 재설정·구글 리다이렉트 오류 이벤트는 연결 여부와 상관없이 처리합니다.)
 */
export const shouldIgnoreAuthEvent = (event: string | undefined, providerConfigured: boolean): boolean =>
  !providerConfigured && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT");
