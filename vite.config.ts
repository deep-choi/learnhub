import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Firebase 웹 설정은 원래 /api/public-config로 누구에게나 공개되는 값입니다.
 * 빌드에 넣어 두면 첫 화면이 Cloud Functions 콜드 스타트를 기다리지 않고 바로 로그인을 복원합니다.
 * 값이 없으면 null을 넣고, 클라이언트는 예전처럼 /api/public-config를 요청합니다.
 */
const firebaseWebConfig = () => {
  const env = loadEnv('learnhub-1de94', path.resolve(__dirname, 'functions'), 'LEARNHUB_FB_');
  const config = {
    apiKey: env.LEARNHUB_FB_WEB_API_KEY?.trim(),
    authDomain: env.LEARNHUB_FB_AUTH_DOMAIN?.trim(),
    projectId: env.LEARNHUB_FB_PROJECT_ID?.trim(),
    appId: env.LEARNHUB_FB_APP_ID?.trim(),
    messagingSenderId: env.LEARNHUB_FB_MESSAGING_SENDER_ID?.trim(),
    storageBucket: env.LEARNHUB_FB_STORAGE_BUCKET?.trim(),
  };
  return config.apiKey && config.authDomain && config.projectId && config.appId ? config : null;
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      __LEARNHUB_FIREBASE_CONFIG__: JSON.stringify(firebaseWebConfig()),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
