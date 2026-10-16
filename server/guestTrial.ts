import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/** 로그인 전 사용자가 체험 모델로 나눌 수 있는 대화 횟수(기기당). */
export const GUEST_TRIAL_LIMIT = 10;

/** 이 기기의 체험 횟수를 모두 썼다. */
export class GuestTrialExhaustedError extends Error {}
/** IP별·전체 일일 상한에 도달했다. 기기 횟수와 무관하게 오늘은 받을 수 없다. */
export class GuestTrialUnavailableError extends Error {}

export interface GuestTrialLimits { perDevice: number; perIpPerDay: number; globalPerDay: number }
export interface GuestTrialDaily { total: number; ips: Record<string, number> }
export interface GuestTrialRecord { deviceUsed: number; daily: GuestTrialDaily }
export interface GuestTrialTicket { deviceKey: string; ipKey: string; day: string; remaining: number }

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const assertRecord = (record: GuestTrialRecord): void => {
  if (!isCount(record.deviceUsed) || !isCount(record.daily.total) || Object.values(record.daily.ips).some(count => !isCount(count))) {
    throw new Error("체험 사용량을 확인하지 못했습니다.");
  }
};

/** 기기 횟수와 IP·전체 일일 상한을 함께 확인하고 한 번을 더한다. 상한이면 던지고 아무것도 바꾸지 않는다. */
export function reserveGuestTrialCount(record: GuestTrialRecord, ipKey: string, limits: GuestTrialLimits): { next: GuestTrialRecord; remaining: number } {
  assertRecord(record);
  if (record.deviceUsed >= limits.perDevice) throw new GuestTrialExhaustedError();
  if (record.daily.total >= limits.globalPerDay || (record.daily.ips[ipKey] ?? 0) >= limits.perIpPerDay) throw new GuestTrialUnavailableError();
  const deviceUsed = record.deviceUsed + 1;
  return {
    next: { deviceUsed, daily: { total: record.daily.total + 1, ips: { ...record.daily.ips, [ipKey]: (record.daily.ips[ipKey] ?? 0) + 1 } } },
    remaining: Math.max(0, limits.perDevice - deviceUsed),
  };
}

/** 답을 만들지 못했을 때 방금 더한 한 번을 돌려준다. */
export function releaseGuestTrialCount(record: GuestTrialRecord, ipKey: string): GuestTrialRecord {
  assertRecord(record);
  const ipCount = record.daily.ips[ipKey] ?? 0;
  return {
    deviceUsed: Math.max(0, record.deviceUsed - 1),
    daily: { total: Math.max(0, record.daily.total - 1), ips: ipCount > 0 ? { ...record.daily.ips, [ipKey]: ipCount - 1 } : record.daily.ips },
  };
}

/** 한 기기의 누적 횟수와 그날의 합계를 하나의 원자적 단위로 읽고 쓴다. */
export interface GuestTrialStorage {
  transact<T>(deviceKey: string, day: string, update: (current: GuestTrialRecord) => { next: GuestTrialRecord; result: T }): Promise<T>;
}

export class MemoryGuestTrialStorage implements GuestTrialStorage {
  private readonly devices = new Map<string, number>();
  private readonly days = new Map<string, GuestTrialDaily>();
  async transact<T>(deviceKey: string, day: string, update: (current: GuestTrialRecord) => { next: GuestTrialRecord; result: T }): Promise<T> {
    // 지난 날의 합계는 버린다. 기기 누적은 평생 유지한다. (자정을 넘긴 되돌리기가 오늘 합계를 지우지 않도록 더 이른 날만 지운다.)
    for (const key of this.days.keys()) if (key < day) this.days.delete(key);
    const { next, result } = update({ deviceUsed: this.devices.get(deviceKey) ?? 0, daily: this.days.get(day) ?? { total: 0, ips: {} } });
    this.devices.set(deviceKey, next.deviceUsed);
    this.days.set(day, next.daily);
    return result;
  }
}

export class FirestoreGuestTrialStorage implements GuestTrialStorage {
  async transact<T>(deviceKey: string, day: string, update: (current: GuestTrialRecord) => { next: GuestTrialRecord; result: T }): Promise<T> {
    const projectId = process.env.LEARNHUB_FB_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const db = getFirestore(getApps()[0] || initializeApp(projectId ? { projectId } : {}));
    const deviceRef = db.collection("learnhubGuestTrialDevices").doc(deviceKey);
    const dayRef = db.collection("learnhubGuestTrialDaily").doc(day);
    return db.runTransaction(async tx => {
      const [deviceSnapshot, daySnapshot] = await Promise.all([tx.get(deviceRef), tx.get(dayRef)]);
      const rawDay = daySnapshot.data();
      const ips = rawDay?.ips;
      if (rawDay && (!ips || typeof ips !== "object" || Array.isArray(ips))) throw new Error("체험 사용량을 확인하지 못했습니다.");
      const { next, result } = update({
        deviceUsed: deviceSnapshot.data()?.used ?? 0,
        daily: rawDay ? { total: rawDay.total, ips } : { total: 0, ips: {} },
      });
      tx.set(deviceRef, { used: next.deviceUsed, updatedAt: new Date() });
      tx.set(dayRef, { ...next.daily, expiresAt: new Date(new Date(`${day}T00:00:00.000Z`).getTime() + 7 * 86_400_000) });
      return result;
    });
  }
}

export interface GuestTrialQuotaOptions {
  usageLimitsEnabled?: boolean;
  perDevice?: number;
  perIpPerDay?: number;
  globalPerDay?: number;
  storage?: GuestTrialStorage;
  now?: () => Date;
}

export class GuestTrialQuota {
  private readonly limits: GuestTrialLimits;
  private readonly storage: GuestTrialStorage;
  constructor(private readonly options: GuestTrialQuotaOptions = {}) {
    this.limits = { perDevice: options.perDevice ?? GUEST_TRIAL_LIMIT, perIpPerDay: options.perIpPerDay ?? 30, globalPerDay: options.globalPerDay ?? 1000 };
    for (const n of Object.values(this.limits)) if (!Number.isSafeInteger(n) || n < 1 || n > 100_000) throw new Error("체험 한도 설정을 확인해 주세요.");
    this.storage = options.storage ?? new MemoryGuestTrialStorage();
  }

  async reserve(deviceId: string, ip: string): Promise<GuestTrialTicket> {
    if (!deviceId || deviceId.length > 100 || !ip || ip.length > 200) throw new Error("접속 정보를 확인하지 못했습니다.");
    const day = (this.options.now?.() || new Date()).toISOString().slice(0, 10);
    const deviceKey = createHash("sha256").update(`guest-device:${deviceId}`).digest("hex");
    const ipKey = createHash("sha256").update(`${day}:ip:${ip.replace(/^::ffff:/iu, "")}`).digest("hex");
    if (this.options.usageLimitsEnabled === false) return { deviceKey, ipKey, day, remaining: this.limits.perDevice };
    const remaining = await this.storage.transact(deviceKey, day, current => {
      const { next, remaining: left } = reserveGuestTrialCount(current, ipKey, this.limits);
      return { next, result: left };
    });
    return { deviceKey, ipKey, day, remaining };
  }

  async release(ticket: GuestTrialTicket): Promise<void> {
    if (this.options.usageLimitsEnabled === false) return;
    await this.storage.transact(ticket.deviceKey, ticket.day, current => ({ next: releaseGuestTrialCount(current, ticket.ipKey), result: undefined }));
  }
}
