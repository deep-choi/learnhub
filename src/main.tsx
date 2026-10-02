import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { clearAuthAdapter, configureAuthAdapter } from './services/authClient';
import { initializeFirebaseAuth, LEARNHUB_AUTH_CHANGED_EVENT } from './services/firebaseClient';

const renderApp = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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
