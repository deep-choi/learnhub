import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export class PreviewQuotaExceededError extends Error {}
export interface PreviewUsage { total: number; clients: Record<string, number> }
export function reservePreviewCount(usage: PreviewUsage, client: string, perIp = 3, globalLimit = 100): PreviewUsage {
  if (!Number.isSafeInteger(usage.total) || usage.total < 0 || !Number.isSafeInteger(usage.clients[client] ?? 0) || (usage.clients[client] ?? 0) < 0) throw new Error("미리보기 사용량을 확인하지 못했습니다.");
  if (usage.total >= globalLimit || (usage.clients[client] || 0) >= perIp) throw new PreviewQuotaExceededError();
  return { total: usage.total + 1, clients: { ...usage.clients, [client]: (usage.clients[client] || 0) + 1 } };
}
export class PreviewQuota {
  private day = "";
  private usage: PreviewUsage = { total: 0, clients: {} };
  constructor(private options: { usageLimitsEnabled?: boolean; perIp?: number; globalLimit?: number; now?: () => Date; durableReserve?: (day: string, client: string, perIp: number, globalLimit: number) => Promise<void> } = {}) {
    for (const n of [options.perIp ?? 3, options.globalLimit ?? 100]) if (!Number.isSafeInteger(n) || n < 1 || n > 10000) throw new Error("미리보기 한도 설정을 확인해 주세요.");
  }
  async reserve(ip: string): Promise<void> {
    if (!ip || ip.length > 200) throw new Error("접속 정보를 확인하지 못했습니다.");
    if (this.options.usageLimitsEnabled === false) return;
    const day = (this.options.now?.() || new Date()).toISOString().slice(0, 10);
    const client = createHash("sha256").update(`${day}:${ip.replace(/^::ffff:/iu, "")}`).digest("hex");
    if (this.options.durableReserve) return this.options.durableReserve(day, client, this.options.perIp ?? 3, this.options.globalLimit ?? 100);
    if (day !== this.day) { this.day = day; this.usage = { total: 0, clients: {} }; }
    this.usage = reservePreviewCount(this.usage, client, this.options.perIp, this.options.globalLimit);
  }
}

/** Single daily transaction serializes the global and IP budgets across instances. */
export async function reserveFirestorePreview(day: string, client: string, perIp: number, globalLimit: number): Promise<void> {
  const projectId = process.env.LEARNHUB_FB_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const app = getApps()[0] || initializeApp(projectId ? { projectId } : {});
  const db = getFirestore(app);
  const ref = db.collection("learnhubPreviewUsage").doc(day);
  await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const raw = snapshot.data();
    const previous: PreviewUsage = raw ? { total: raw.total, clients: raw.clients } : { total: 0, clients: {} };
    if (!previous.clients || typeof previous.clients !== "object" || Array.isArray(previous.clients)) throw new Error("미리보기 사용량을 확인하지 못했습니다.");
    const next = reservePreviewCount(previous, client, perIp, globalLimit);
    tx.set(ref, { ...next, expiresAt: new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 7 * 86400000) });
  });
}
