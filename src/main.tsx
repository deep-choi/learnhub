import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { clearAuthAdapter, configureAuthAdapter } from './services/authClient';
import { initializeSupabaseAuth, LEARNHUB_AUTH_CHANGED_EVENT } from './services/supabaseClient';

const renderApp = () => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Render immediately even if the local API or public Supabase config is down.
renderApp();

void initializeSupabaseAuth()
  .then((handle) => {
    if (!handle) {
      clearAuthAdapter();
      return;
    }
    configureAuthAdapter(handle.adapter);
    window.dispatchEvent(new CustomEvent(LEARNHUB_AUTH_CHANGED_EVENT, {
      detail: { event: "INITIAL_SESSION", userId: handle.adapter.getAuthStatus?.()?.userId || null },
    }));
  })
  .catch(() => {
    // Missing/unavailable public config remains the default fail-closed state.
    clearAuthAdapter();
  });
