import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { type AddressInfo } from "node:net";
import {
  isStudyLibrary,
  emptyStudyLibrary,
  validStudyOutput,
  groundedStudyOutput,
  studyExcerpts,
  safeWebUrl,
  mergeStudyLibraries,
  buildStudyRequest,
  type StudySource,
} from "../src/domain/study";
import {
  createLearningBackup,
  validateLearningBackup,
  importLearningBackup,
  carryNewerLocalRecords,
  isPortableLearningStorageKey,
} from "../src/services/learningBackup";
import { LEARNHUB_STORAGE_KEYS, StorageService } from "../src/services/storage";
import { publicStudyAddress } from "../server/studyUrl";
import { studyRouter } from "../server/study";
import { AiGateway } from "../server/aiGateway";
import { DEFAULT_AI_SELECTION } from "../src/domain/aiModels";
const stamp = "2026-10-04T12:00:00.000Z";
const source: StudySource = {
  id: "s1",
  title: "교재",
  text: "[페이지 1]\n세포는 생물의 기본 단위입니다.",
  kind: "file",
  updatedAt: stamp,
};
const output = {
  title: "세포",
  reply: "세포는 생물의 기본 단위입니다. [1]",
  citations: [{ sourceId: "s1", quote: "세포는 생물의 기본 단위입니다." }],
};
class MemoryStorage {
  values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
}
test("study citations must quote actual selected sources; corrections must uniquely match", () => {
  assert.equal(groundedStudyOutput(output, [source]), true);
  assert.equal(
    groundedStudyOutput(
      { ...output, citations: [{ sourceId: "other", quote: source.text }] },
      [source],
    ),
    false,
  );
  assert.equal(
    groundedStudyOutput(
      { ...output, citations: [{ sourceId: "s1", quote: "없는 주장" }] },
      [source],
    ),
    false,
  );
  assert.equal(
    groundedStudyOutput(
      {
        citations: [],
        corrections: [
          { sourceId: "s1", before: "세포", after: "조직", reason: "테스트" },
        ],
      },
      [{ ...source, text: "세포 세포" }],
    ),
    false,
  );
});
test("study output validation rejects out of range and duplicate quiz answers", () => {
  const q = {
    question: "기본 단위는?",
    options: ["세포", "조직", "기관", "개체"],
    answer: 0,
    explanation: "세포입니다.",
  };
  assert.equal(validStudyOutput({ ...output, questions: [q] }, "quiz"), true);
  assert.equal(
    validStudyOutput({ ...output, questions: [{ ...q, answer: 4 }] }, "quiz"),
    false,
  );
  assert.equal(
    validStudyOutput(
      {
        ...output,
        questions: [{ ...q, options: ["세포", "세포", "조직", "기관"] }],
      },
      "quiz",
    ),
    false,
  );
  assert.equal(validStudyOutput(output, "video"), false);
  assert.equal(validStudyOutput({ ...output, cards: [] }, "flashcards"), false);
});
test("retrieval bounds context and includes a relevant passage near the end", () => {
  const long = {
    ...source,
    text:
      "배경 설명입니다. ".repeat(8000) + "\n핵산 DNA는 유전 정보를 담습니다.",
  };
  const excerpts = studyExcerpts([long], "DNA 핵산");
  assert.ok(excerpts[0].text.includes("DNA"));
  assert.ok(excerpts[0].text.length <= 14000);
  assert.ok(
    studyExcerpts(
      Array.from({ length: 8 }, (_, i) => ({ ...long, id: `s${i}` })),
      "DNA",
    ).reduce((n, s) => n + s.text.length, 0) <= 14000,
  );
});

test("serialized context remains bounded with long URLs, quotes and history", () => {
  const request = buildStudyRequest(
    "chat",
    "질문".repeat(1000),
    Array.from({ length: 8 }, (_, i) => ({
      ...source,
      id: `s${i}`,
      title: "제목".repeat(100),
      text: '"\\\n'.repeat(20_000),
      url: "https://example.com/" + "a".repeat(1900),
    })),
    Array.from({ length: 8 }, () => ({ role: "user", text: '"'.repeat(500) })),
    '"'.repeat(1200),
  );
  assert.ok(JSON.stringify(request).length <= 20_000);
  assert.equal(request.sources.length, 8);
  assert.equal(
    request.sources.some((s) => "url" in s),
    false,
  );
});

test("logout clears the new library together with existing account data", () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  storage.setItem(
    LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY,
    JSON.stringify({ ...emptyStudyLibrary(), sources: [source] }),
  );
  StorageService.logout();
  assert.equal(storage.getItem(LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY), null);
});
test("source library is backed up, restored, cleared, validated, and merged without data loss", () => {
  const storage = new MemoryStorage();
  const library = { ...emptyStudyLibrary(), sources: [source] };
  storage.setItem(LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY, JSON.stringify(library));
  const backup = createLearningBackup(storage as Storage);
  assert.deepEqual(backup.data.studyLibrary, library);
  assert.equal(validateLearningBackup(backup).ok, true);
  assert.equal(
    isPortableLearningStorageKey(LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY),
    true,
  );
  const other = new MemoryStorage();
  const imported = importLearningBackup(backup, {
    strategy: "overwrite",
    storage: other as Storage,
  });
  assert.equal(imported.ok, true);
  assert.deepEqual(
    JSON.parse(other.getItem(LEARNHUB_STORAGE_KEYS.STUDY_LIBRARY)!),
    library,
  );
  assert.equal(
    isStudyLibrary({ ...library, sources: [source, source] }),
    false,
  );
  assert.equal(
    isStudyLibrary({
      ...library,
      sources: [{ ...source, text: "x".repeat(120001) }],
    }),
    false,
  );
  assert.equal(
    mergeStudyLibraries(library, {
      ...library,
      sources: [
        { ...source, title: "수정", updatedAt: "2026-10-05T00:00:00Z" },
      ],
    }).sources[0].title,
    "수정",
  );
});
test("unsynced new study material survives a newer remote snapshot; deleted old material does not reappear", () => {
  const remote = {
    schema: "learnhub.learning-backup" as const,
    version: 1 as const,
    exportedAt: "2026-10-04T11:00:00Z",
    data: { studyLibrary: emptyStudyLibrary() },
  };
  const local = {
    ...remote,
    data: {
      studyLibrary: {
        ...emptyStudyLibrary(),
        sources: [
          source,
          { ...source, id: "deleted", updatedAt: "2026-10-01T00:00:00Z" },
        ],
      },
    },
  };
  const carried = carryNewerLocalRecords(remote, local);
  assert.equal(carried.carried, 1);
  assert.deepEqual(
    carried.snapshot.data.studyLibrary!.sources.map((s) => s.id),
    ["s1"],
  );
});
test("URL imports reject private, metadata, loopback, mapped IPv6, credentials and non HTTPS URLs", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "0.0.0.0",
    "100.64.0.1",
  ])
    assert.equal(publicStudyAddress(ip), false, ip);
  assert.equal(publicStudyAddress("8.8.8.8"), true);
  for (const url of [
    "http://example.com",
    "https://localhost",
    "https://127.1",
    "https://a.local",
    "https://user:pass@example.com",
    "file:///tmp/a",
    "javascript:alert(1)",
    "https://example.com:8443",
  ])
    assert.equal(safeWebUrl(url), null, url);
});
test("study endpoint authorizes, reserves usage, validates quotes, and fails closed on bad output", async () => {
  let permitted = true,
    reserved = 0,
    called = 0,
    fake: any = output;
  const gateway = {
    generateJson: async () => {
      called++;
      return { payload: fake };
    },
  } as unknown as AiGateway;
  const app = express();
  app.use(express.json());
  app.use(
    "/api/ai",
    studyRouter({
      gateway,
      authorize: async (_req, res) => {
        if (!permitted) res.status(401).end();
        return permitted;
      },
      clientKey: () => "test",
      selection: () => DEFAULT_AI_SELECTION,
      reserve: async () => {
        reserved++;
      },
      error: (res) => res.status(503).end(),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/study`;
  const request = (body: any) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const body = {
    action: "chat",
    question: "세포란?",
    sources: [source],
    history: [],
  };
  try {
    assert.equal((await request(body)).status, 200);
    assert.equal(reserved, 1);
    permitted = false;
    assert.equal((await request(body)).status, 401);
    assert.equal(called, 1);
    permitted = true;
    assert.equal(
      (await request({ ...body, sources: [source, source] })).status,
      400,
    );
    fake = { ...output, citations: [{ sourceId: "s1", quote: "없는 인용" }] };
    assert.equal((await request(body)).status, 502);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
