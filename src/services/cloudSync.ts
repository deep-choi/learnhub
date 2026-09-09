import { StorageService } from "./storage";
import {
  BackupConflictStrategy,
  BackupImportResult,
  LearningBackupDocument,
  backupToJson,
  createLearningBackup,
  importLearningBackup,
  validateLearningBackup,
} from "./learningBackup";
import { authorizedFetch, authorizedFetchForUser, getAuthStatus } from "./authClient";

export const LEARNHUB_CLOUD_DATA_OWNER_KEY = "learnhub_cloud_data_owner_v1";

export interface LearningSnapshotResponse {
  snapshot: LearningBackupDocument;
  revision: number;
  updatedAt: string;
}

export class SnapshotConflictError extends Error {
  readonly code = "snapshot_conflict";
  readonly current: LearningSnapshotResponse | null;

  constructor(current: LearningSnapshotResponse | null) {
    super("클라우드 학습 기록이 먼저 변경되었습니다. 최신 기록을 확인한 뒤 다시 시도해 주세요.");
    this.name = "SnapshotConflictError";
    this.current = current;
  }
}

const isSnapshotResponse = (value: unknown): value is LearningSnapshotResponse => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (!Number.isInteger(body.revision) || (body.revision as number) < 0 || typeof body.updatedAt !== "string") return false;
  const validation = validateLearningBackup(body.snapshot);
  return validation.ok && Number.isFinite(new Date(body.updatedAt).getTime());
};

const parseSnapshotResponse = async (response: Response): Promise<LearningSnapshotResponse> => {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("클라우드 학습 기록 응답을 읽지 못했습니다.");
  }
  if (!isSnapshotResponse(body)) throw new Error("클라우드 학습 기록 형식이 올바르지 않습니다.");
  return body;
};

export const getLearningSnapshot = async (expectedUserId?: string): Promise<LearningSnapshotResponse | null> => {
  const response = expectedUserId
    ? await authorizedFetchForUser("/api/learning-snapshot", { headers: { Accept: "application/json" } }, expectedUserId)
    : await authorizedFetch("/api/learning-snapshot", {
    headers: { Accept: "application/json" },
  });
  if (response.status === 404) {
    if (expectedUserId) assertCurrentAuthUser(expectedUserId);
    return null;
  }
  if (!response.ok) throw new Error("클라우드 학습 기록을 불러오지 못했습니다.");
  const parsed = await parseSnapshotResponse(response);
  if (expectedUserId) assertCurrentAuthUser(expectedUserId);
  return parsed;
};

export const putLearningSnapshot = async (
  snapshot: LearningBackupDocument,
  expectedRevision: number | null,
  expectedUserId?: string,
): Promise<LearningSnapshotResponse> => {
  const body = backupToJson(snapshot);
  if (body.length > 8_000_000) throw new Error("백업 파일이 너무 큽니다.");
  if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
    throw new Error("클라우드 기록 버전이 올바르지 않습니다.");
  }

  const requestInit: RequestInit = {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, expectedRevision }),
  };
  const response = expectedUserId
    ? await authorizedFetchForUser("/api/learning-snapshot", requestInit, expectedUserId)
    : await authorizedFetch("/api/learning-snapshot", requestInit);
  if (response.status === 409) {
    if (expectedUserId) assertCurrentAuthUser(expectedUserId);
    let current: LearningSnapshotResponse | null = null;
    try {
      const candidate: unknown = await response.json();
      if (isSnapshotResponse(candidate)) current = candidate;
    } catch {
      // A conflict without a valid current snapshot still remains a conflict.
    }
    throw new SnapshotConflictError(current);
  }
  if (!response.ok) throw new Error("클라우드 학습 기록을 저장하지 못했습니다.");
  const parsed = await parseSnapshotResponse(response);
  if (expectedUserId) assertCurrentAuthUser(expectedUserId);
  return parsed;
};

export const getKnownLocalOwnerId = (): string => {
  return getKnownLocalOwner().id;
};

export const getKnownLocalOwner = (): { id: string; isLocalOnly: boolean } => {
  try {
    const user = StorageService.getUser();
    return { id: user.id, isLocalOnly: user.isLocalOnly === true || user.isGuest === true };
  } catch {
    return { id: "guest-user", isLocalOnly: true };
  }
};

export const getCloudDataOwnerId = (): string | null => {
  try {
    const ownerId = localStorage.getItem(LEARNHUB_CLOUD_DATA_OWNER_KEY);
    return ownerId && ownerId.trim().length > 0 ? ownerId : null;
  } catch {
    return null;
  }
};

/** Bind local cloud-owned data only after explicit consent and before upload. */
export const bindCloudDataOwner = (
  authenticatedUserId: string,
  localOwnerId: string,
  allowExplicitGuestMigration = false,
): void => {
  const existingOwnerId = getCloudDataOwnerId();
  if (existingOwnerId && existingOwnerId !== authenticatedUserId) {
    throw new Error("이 기기의 클라우드 기록은 다른 계정에 연결되어 있어 업로드를 중단했습니다.");
  }
  if (existingOwnerId === authenticatedUserId) return;
  assertLearningSnapshotUploadOwner(authenticatedUserId, localOwnerId, allowExplicitGuestMigration);
  try {
    localStorage.setItem(LEARNHUB_CLOUD_DATA_OWNER_KEY, authenticatedUserId);
    if (localStorage.getItem(LEARNHUB_CLOUD_DATA_OWNER_KEY) !== authenticatedUserId) {
      throw new Error("소유자 표시를 확인할 수 없습니다.");
    }
  } catch {
    throw new Error("클라우드 기록 소유자 표시를 저장하지 못해 업로드를 중단했습니다.");
  }
};

const assertCurrentAuthUser = (capturedUserId: string): void => {
  if (getAuthStatus().userId !== capturedUserId) {
    throw new Error("계정이 바뀌어 늦게 도착한 클라우드 응답을 반영하지 않았습니다.");
  }
};

const restoreCloudDataOwner = (ownerId: string | null): boolean => {
  try {
    if (ownerId === null) localStorage.removeItem(LEARNHUB_CLOUD_DATA_OWNER_KEY);
    else localStorage.setItem(LEARNHUB_CLOUD_DATA_OWNER_KEY, ownerId);
    return getCloudDataOwnerId() === ownerId;
  } catch {
    return false;
  }
};

export const assertLearningSnapshotUploadOwner = (
  authenticatedUserId: string,
  localOwnerId: string,
  allowExplicitGuestMigration = false,
): void => {
  if (!authenticatedUserId.trim()) throw new Error("로그인한 계정을 확인할 수 없습니다.");
  if (!localOwnerId.trim()) throw new Error("이 기기의 학습 기록 소유자를 확인할 수 없습니다.");
  if (localOwnerId === authenticatedUserId) return;
  if (allowExplicitGuestMigration && (localOwnerId === "guest-user" || localOwnerId.startsWith("local-user-"))) return;
  throw new Error("이 기기의 기록이 다른 계정에 속할 수 있어 업로드를 중단했습니다. 먼저 백업하거나 계정 전환을 확인해 주세요.");
};

export const saveCurrentLearningSnapshot = async (
  authenticatedUserId: string,
  expectedRevision: number | null,
  options: { confirmed: boolean; localOwnerId?: string; allowExplicitGuestMigration?: boolean },
): Promise<LearningSnapshotResponse> => {
  if (!options.confirmed) throw new Error("클라우드 저장은 사용자의 확인이 필요합니다.");
  const localOwnerId = options.localOwnerId || getKnownLocalOwnerId();
  assertCurrentAuthUser(authenticatedUserId);
  const existingCloudOwnerId = getCloudDataOwnerId();
  if (existingCloudOwnerId && existingCloudOwnerId !== authenticatedUserId) {
    throw new Error("이 기기의 클라우드 기록은 다른 계정에 연결되어 있어 업로드를 중단했습니다.");
  }
  assertLearningSnapshotUploadOwner(
    authenticatedUserId,
    localOwnerId,
    options.allowExplicitGuestMigration === true,
  );
  // Ownership is persisted before the request, so an account switch cannot
  // make this local snapshot appear ownerless or adoptable by another account.
  bindCloudDataOwner(
    authenticatedUserId,
    localOwnerId,
    options.allowExplicitGuestMigration === true,
  );
  const response = await putLearningSnapshot(createLearningBackup(), expectedRevision, authenticatedUserId);
  assertCurrentAuthUser(authenticatedUserId);
  return response;
};

export const restoreLearningSnapshot = (
  authenticatedUserId: string,
  snapshot: LearningBackupDocument,
  strategy: BackupConflictStrategy,
  options: { confirmed: boolean; storage?: Storage },
): BackupImportResult => {
  if (!authenticatedUserId.trim()) throw new Error("로그인한 계정을 확인할 수 없습니다.");
  if (!options.confirmed) throw new Error("클라우드 복원은 사용자의 확인이 필요합니다.");
  assertCurrentAuthUser(authenticatedUserId);
  const localOwnerId = getKnownLocalOwner().id;
  const existingCloudOwnerId = getCloudDataOwnerId();
  if (existingCloudOwnerId && existingCloudOwnerId !== authenticatedUserId) {
    throw new Error("이 기기의 클라우드 기록은 다른 계정에 연결되어 있어 복원을 중단했습니다.");
  }
  if (!existingCloudOwnerId && localOwnerId !== authenticatedUserId && localOwnerId !== "guest-user" && !localOwnerId.startsWith("local-user-")) {
    throw new Error("현재 이 기기의 기록 소유자를 확인할 수 없어 복원을 중단했습니다.");
  }
  const validation = validateLearningBackup(snapshot);
  if (!validation.ok) throw new Error(validation.errors.join(" "));
  const ownerBeforeRestore = existingCloudOwnerId;
  // Bind before local writes so a failed/partial restore cannot leave an
  // unowned snapshot adoptable by a different account.
  bindCloudDataOwner(authenticatedUserId, localOwnerId, true);
  const result = importLearningBackup(snapshot, { strategy, storage: options.storage });
  if (!result.ok && ownerBeforeRestore === null) {
    // A failed import may already have attempted a partial write. Removing
    // the marker after an uncertain rollback would make those records
    // adoptable by the next account on this device.
    const importDefinitelyUnchanged = result.rollbackStatus === "not-needed" && result.importedEntries === 0;
    const importWasSafelyRolledBack = result.rolledBack && result.rollbackStatus === "succeeded";
    if (!importDefinitelyUnchanged && !importWasSafelyRolledBack) {
      return {
        ...result,
        recoveryRequired: true,
        warnings: [...result.warnings, "복구가 불확실해 현재 계정의 소유자 표시를 유지했습니다."],
        error: `${result.error || "복원에 실패했습니다."} 소유자 표시를 유지했으며 안전 백업으로 확인이 필요합니다.`,
      };
    }
    // No local writes occurred, or the complete allowlisted namespace was
    // verified restored, so it is safe to remove the marker we just bound.
    if (!restoreCloudDataOwner(ownerBeforeRestore)) {
      return {
        ...result,
        recoveryRequired: true,
        warnings: [...result.warnings, "클라우드 소유자 표시를 되돌리지 못해 복구가 필요합니다."],
        error: `${result.error || "복원에 실패했습니다."} 클라우드 소유자 표시도 되돌리지 못했습니다. 안전 백업으로 복구가 필요합니다.`,
      };
    }
    return result;
  }
  if (!result.ok) return result;
  assertCurrentAuthUser(authenticatedUserId);
  return result;
};
