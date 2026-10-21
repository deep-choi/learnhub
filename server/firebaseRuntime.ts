import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export const projectId = (): string => {
  let runtimeProjectId = "";
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG || "") as { projectId?: unknown };
    runtimeProjectId = typeof config.projectId === "string" ? config.projectId : "";
  } catch { /* Firebase config is optional outside Functions. */ }
  return (process.env.LEARNHUB_FB_PROJECT_ID || runtimeProjectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
};
export const firebaseAdminApp = () => getApps()[0] || initializeApp({ ...(projectId() ? { projectId: projectId() } : {}) });
export const firestore = () => getFirestore(firebaseAdminApp());
export const firebaseAdminAuth = () => getAuth(firebaseAdminApp());
