export interface OperationsSettings {
  revision: number;
  aiPaused: boolean;
  limitsEnabled: boolean;
  requestLimit: number;
  outputTokenLimit: number;
  globalRequestLimit: number;
  globalOutputTokenLimit: number;
  disabledModels: string[];
}
export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  aiBlocked: boolean;
  requestsToday: number;
  reservedTokensToday: number;
  snapshotUpdatedAt: string | null;
  snapshotRevision: number | null;
}
export interface AdminReport {
  id: string;
  userId: string;
  category: string;
  description: string;
  courseId: string | null;
  lessonId: string | null;
  createdAt: string;
  status: "received" | "reviewing" | "resolved";
  note: string;
  revision: number;
}
export interface AdminAudit {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
  before: unknown;
  after: unknown;
}
export interface AdminOverview {
  day: string;
  totalUsers: number;
  admittedRequests: number;
  reservedOutputTokens: number;
  completedRequests: number;
  failedRequests: number;
  actualTokens: number;
  meanDurationMs: number | null;
  recentFailures: Array<{ id: string; endpoint: string; model: string; status: string; durationMs: number; createdAt: string }>;
}
