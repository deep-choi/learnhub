import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
const AdminPage = lazy(() => import('./components/admin/AdminPage'));
import './index.css';
import { clearAuthAdapter, configureAuthAdapter } from './services/authClient';
import { initializeFirebaseAuth, LEARNHUB_AUTH_CHANGED_EVENT } from './services/firebaseClient';
import { fetchAiAvailability } from './services/aiAvailability';

const renderApp = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div style={{padding:32}}>불러오는 중…</div>}>
      {window.location.pathname.replace(/\/+$/u, '') === '/admin' ? <AdminPage /> : <App />}
    </Suspense>
  </StrictMode>,
);

// React effects subscribe after the initial render. Defer the auth result one
// macrotask so a fast configuration/network failure cannot be lost before App mounts.
const notifyAuthChanged = (event: string, userId: string | null) => {
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, {
      detail: { event, userId },
    }));
  }, 0);
};

// Render immediately even if the local API or public Firebase config is down.
renderApp();

// 어차피 필요한 AI 가용성 정보를 지금 요청해 둡니다. 배포 환경에서는 이 요청이 잠든 Cloud Functions를
// 깨우므로, 콜드 스타트가 로그인 복원과 겹쳐 진행되고 이어지는 학습 기록 요청이 덜 기다립니다.
void fetchAiAvailability();

void initializeFirebaseAuth()
  .then((handle) => {
    if (!handle) {
      clearAuthAdapter();
      notifyAuthChanged("CONFIGURATION_ERROR", null);
      return;
    }
    configureAuthAdapter(handle.adapter);
    notifyAuthChanged("INITIAL_SESSION", handle.adapter.getAuthStatus?.()?.userId || null);
  })
  .catch(() => {
    // Missing/unavailable public config remains the default fail-closed state.
    clearAuthAdapter();
    notifyAuthChanged("CONFIGURATION_ERROR", null);
  });
