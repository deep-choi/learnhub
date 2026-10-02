import { StorageService } from "./storage";
import {
  clearPendingSync,
  getCloudDataOwnerId,
  getPendingSyncOwnerId,
  markPendingSync,
  restoreLearningSnapshot,
  syncCurrentLearningSnapshot,
  type LearningSnapshotResponse,
} from "./cloudSync";
import {
  carryNewerLocalRecords,
  createLearningBackup,
  importLearningBackup,
  type LearningBackupDocument,
} from "./learningBackup";

/** 로그인 직후, 서버 기록을 받기 전에 붙잡아 둔 이 기기의 학습 기록. */
export interface LocalCacheCapture {
  /** 이 계정 것으로 표시된 기기 기록. 다른 계정·게스트 기록이면 null이다. */
  snapshot: LearningBackupDocument | null;
  /** 아직 서버에 올리지 못한 변경이 있다고 표시돼 있는지. */
  pending: boolean;
}

/**
 * 이 계정 것으로 표시된 기기 기록을 메모리에 붙잡아 둡니다.
 * 미동기화 표시가 없어도 붙잡습니다. 표시는 다른 탭의 동기화 완료로 지워지거나 기록되기 전에
 * 새로고침될 수 있으므로, 서버보다 새 기록이 있는지는 서버 기록을 받은 뒤 updatedAt으로 다시 확인합니다.
 */
export const captureLocalCacheForAccount = (userId: string): LocalCacheCapture => {
  try {
    if (getCloudDataOwnerId() === userId) {
      return { snapshot: createLearningBackup(), pending: getPendingSyncOwnerId() === userId };
    }
  } catch {
    // 읽지 못한 기록은 없는 것으로 봅니다.
  }
  return { snapshot: null, pending: false };
};

export interface AccountSyncResult {
  revision: number;
  updatedAt: string;
}

/**
 * 로그인(새로고침 포함) 때 서버 기록과 기기 기록을 맞춥니다.
 * `isCurrent`가 false를 돌려주면(계정이 바뀌었거나 더 새 로그인 처리가 시작됨) null을 돌려줍니다.
 */
export const reconcileAccountSnapshot = async (
  userId: string,
  local: LocalCacheCapture,
  remote: LearningSnapshotResponse | null,
  isCurrent: () => boolean,
): Promise<AccountSyncResult | null> => {
  if (local.pending && local.snapshot) {
    const localRestored = restoreLearningSnapshot(userId, local.snapshot, "overwrite", { confirmed: true });
    if (!localRestored.ok) throw new Error(localRestored.error || "이 기기에 남은 변경사항을 복구하지 못했습니다.");
    if (remote) {
      const remoteMerged = importLearningBackup(remote.snapshot, { strategy: "merge" });
      if (!remoteMerged.ok) throw new Error(remoteMerged.error || "서버 기록과 이 기기의 변경사항을 합치지 못했습니다.");
    }
    const saved = await syncCurrentLearningSnapshot(userId, remote?.revision ?? null);
    if (!isCurrent()) return null;
    clearPendingSync(userId);
    return { revision: saved.revision, updatedAt: saved.updatedAt };
  }
  if (remote) {
    // 서버 기록이 기준이지만, 서버에 아직 없는 더 새 메모·레슨 진행·대화는 덮어쓰지 않고 얹습니다.
    const prepared = local.snapshot ? carryNewerLocalRecords(remote.snapshot, local.snapshot) : { snapshot: remote.snapshot, carried: 0 };
    StorageService.clearLearningData();
    const restored = restoreLearningSnapshot(userId, prepared.snapshot, "overwrite", { confirmed: true });
    if (!restored.ok) throw new Error(restored.error || "계정의 학습 기록을 적용하지 못했습니다.");
    if (prepared.carried === 0) return { revision: remote.revision, updatedAt: remote.updatedAt };
    // 올리는 도중 새로고침돼도 다음 로그인에서 이 기기 기록을 먼저 살리도록 표시를 남깁니다.
    markPendingSync(userId);
    const saved = await syncCurrentLearningSnapshot(userId, remote.revision);
    if (!isCurrent()) return null;
    clearPendingSync(userId);
    return { revision: saved.revision, updatedAt: saved.updatedAt };
  }
  const created = await syncCurrentLearningSnapshot(userId, null);
  if (!isCurrent()) return null;
  return { revision: created.revision, updatedAt: created.updatedAt };
};
