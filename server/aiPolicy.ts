export interface AiAdmissionOptions {
  usageLimitsEnabled?: boolean;
  maxConcurrent?: number;
  maxRequestsPerClientPerMinute?: number;
  dailyOutputTokenBudget?: number;
  dailyRequestBudget?: number;
  perClientDailyOutputTokenBudget?: number;
  perClientDailyRequestBudget?: number;
  maxTrackedClients?: number;
  now?: () => Date;
}

export type AiAdmissionRejectReason =
  | "invalid_request"
  | "client_rate_limit"
  | "global_concurrency"
  | "daily_budget"
  | "daily_request_budget"
  | "client_registry_full";

export interface AiAdmissionLease {
  readonly reservedTokens: number;
  release(): void;
}

interface ClientWindow {
  startedAt: number;
  requests: number;
}

interface ClientDailyUsage {
  dayKey: string;
  reservedTokens: number;
  requests: number;
}

export interface AiAdmissionResult {
  lease: AiAdmissionLease | null;
  reason?: AiAdmissionRejectReason;
}

export interface LoopbackRequestHeaders {
  remoteAddress: string;
  host: string;
  origin?: string;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const normalizeAddress = (value: string) => value.trim().replace(/^::ffff:/i, "").replace(/^\[|\]$/g, "").toLowerCase();

const parseHost = (value: string): { hostname: string; port: string } | null => {
  const host = value.trim().toLowerCase();
  if (!host || host.includes(",") || host.includes("@")) return null;
  try {
    const parsed = new URL(`http://${host}`);
    return { hostname: normalizeAddress(parsed.hostname), port: parsed.port || "80" };
  } catch {
    return null;
  }
};

/** Local development exception: loopback socket, loopback Host, and same Origin. */
export const isAllowedLoopbackRequest = (input: LoopbackRequestHeaders): boolean => {
  const address = normalizeAddress(input.remoteAddress);
  const host = parseHost(input.host);
  if (!LOOPBACK_HOSTS.has(address) || !host || !LOOPBACK_HOSTS.has(host.hostname)) return false;
  if (!input.origin) return true;
  if (input.origin === "null") return false;
  try {
    const origin = new URL(input.origin);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;
    const originHost = parseHost(origin.host);
    return originHost !== null && originHost.hostname === host.hostname && originHost.port === host.port;
  } catch {
    return false;
  }
};

/** Process-local limits; these are not a distributed quota or billing cap. */
export class AiAdmissionController {
  private readonly usageLimitsEnabled: boolean;
  private readonly maxConcurrent: number;
  private readonly maxRequestsPerClientPerMinute: number;
  private readonly dailyOutputTokenBudget: number;
  private readonly dailyRequestBudget: number;
  private readonly perClientDailyOutputTokenBudget: number;
  private readonly perClientDailyRequestBudget: number;
  private readonly maxTrackedClients: number;
  private readonly now: () => Date;
  private readonly clientWindows = new Map<string, ClientWindow>();
  private readonly clientDailyUsage = new Map<string, ClientDailyUsage>();
  private activeRequests = 0;
  private dayKey = "";
  private reservedDailyTokens = 0;
  private dailyRequests = 0;

  constructor(options: AiAdmissionOptions = {}) {
    this.usageLimitsEnabled = options.usageLimitsEnabled ?? true;
    this.maxConcurrent = finitePositiveInteger(options.maxConcurrent ?? 2, "maxConcurrent");
    this.maxRequestsPerClientPerMinute = finitePositiveInteger(options.maxRequestsPerClientPerMinute ?? 12, "maxRequestsPerClientPerMinute");
    this.dailyOutputTokenBudget = finitePositiveInteger(options.dailyOutputTokenBudget ?? 1_000_000, "dailyOutputTokenBudget");
    this.dailyRequestBudget = finitePositiveInteger(options.dailyRequestBudget ?? 10_000, "dailyRequestBudget");
    this.perClientDailyOutputTokenBudget = finitePositiveInteger(options.perClientDailyOutputTokenBudget ?? 100_000, "perClientDailyOutputTokenBudget");
    this.perClientDailyRequestBudget = finitePositiveInteger(options.perClientDailyRequestBudget ?? 100, "perClientDailyRequestBudget");
    this.maxTrackedClients = finitePositiveInteger(options.maxTrackedClients ?? 1_000, "maxTrackedClients");
    this.now = options.now ?? (() => new Date());
  }

  tryAcquire(clientKey: string, requestedOutputTokens: number): AiAdmissionResult {
    const now = this.now();
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs) || !Number.isFinite(requestedOutputTokens) || requestedOutputTokens <= 0 || !Number.isInteger(requestedOutputTokens)) {
      return { lease: null, reason: "invalid_request" };
    }
    const safeClientKey = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : "unknown";
    const tokens = Math.max(1, Math.ceil(requestedOutputTokens));
    const currentDay = now.toISOString().slice(0, 10);

    if (currentDay !== this.dayKey) {
      this.dayKey = currentDay;
      this.reservedDailyTokens = 0;
      this.dailyRequests = 0;
      this.clientDailyUsage.clear();
    }
    if (this.activeRequests >= this.maxConcurrent) return { lease: null, reason: "global_concurrency" };
    if (this.usageLimitsEnabled && this.reservedDailyTokens + tokens > this.dailyOutputTokenBudget) return { lease: null, reason: "daily_budget" };
    if (this.usageLimitsEnabled && this.dailyRequests >= this.dailyRequestBudget) return { lease: null, reason: "daily_request_budget" };

    const clientDaily = this.clientDailyUsage.get(safeClientKey)?.dayKey === currentDay
      ? this.clientDailyUsage.get(safeClientKey)!
      : { dayKey: currentDay, reservedTokens: 0, requests: 0 };
    if (this.usageLimitsEnabled && clientDaily.reservedTokens + tokens > this.perClientDailyOutputTokenBudget) return { lease: null, reason: "daily_budget" };
    if (this.usageLimitsEnabled && clientDaily.requests >= this.perClientDailyRequestBudget) return { lease: null, reason: "daily_request_budget" };

    for (const [key, value] of this.clientWindows) {
      if (nowMs - value.startedAt >= 60_000) this.clientWindows.delete(key);
    }
    const window = this.clientWindows.get(safeClientKey);
    const activeWindow = window && nowMs - window.startedAt < 60_000
      ? window
      : { startedAt: nowMs, requests: 0 };
    if (this.usageLimitsEnabled && activeWindow.requests >= this.maxRequestsPerClientPerMinute) return { lease: null, reason: "client_rate_limit" };
    if (!window && this.clientWindows.size >= this.maxTrackedClients) return { lease: null, reason: "client_registry_full" };

    activeWindow.requests += 1;
    this.clientWindows.set(safeClientKey, activeWindow);
    this.activeRequests += 1;
    this.reservedDailyTokens += tokens;
    this.dailyRequests += 1;
    clientDaily.reservedTokens += tokens;
    clientDaily.requests += 1;
    this.clientDailyUsage.set(safeClientKey, clientDaily);
    let released = false;
    return {
      lease: {
        reservedTokens: tokens,
        release: () => {
          if (released) return;
          released = true;
          this.activeRequests = Math.max(0, this.activeRequests - 1);
        },
      },
    };
  }

  getSnapshot(clientKey?: string) {
    const safeClientKey = typeof clientKey === "string" && clientKey.trim() ? clientKey.trim() : "unknown";
    const clientDaily = this.clientDailyUsage.get(safeClientKey);
    const sameDay = clientDaily?.dayKey === this.dayKey;
    const clientRequests = sameDay ? clientDaily.requests : 0;
    const clientTokens = sameDay ? clientDaily.reservedTokens : 0;
    return {
      activeRequests: this.activeRequests,
      reservedDailyTokens: this.reservedDailyTokens,
      dailyRequests: this.dailyRequests,
      trackedClients: this.clientWindows.size,
      dayKey: this.dayKey,
      limits: {
        enabled: this.usageLimitsEnabled,
        maxConcurrent: this.maxConcurrent,
        requestsPerMinute: this.maxRequestsPerClientPerMinute,
        requestsPerDay: this.perClientDailyRequestBudget,
        reservedOutputTokensPerDay: this.perClientDailyOutputTokenBudget,
        globalRequestsPerDay: this.dailyRequestBudget,
        globalReservedOutputTokensPerDay: this.dailyOutputTokenBudget,
      },
      client: {
        requestsToday: clientRequests,
        reservedOutputTokensToday: clientTokens,
        remainingRequestsToday: Math.max(0, this.perClientDailyRequestBudget - clientRequests),
        remainingReservedOutputTokensToday: Math.max(0, this.perClientDailyOutputTokenBudget - clientTokens),
      },
    };
  }
}

function finitePositiveInteger(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) throw new TypeError(`${name} must be a finite positive integer`);
  return value;
}
