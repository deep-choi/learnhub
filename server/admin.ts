import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { AI_MODEL_CATALOG } from "../src/domain/aiModels";
import { adminStore, verifyAdminToken } from "./adminStore";
import { OperationsError } from "./operationsPolicy";

export const createAdminRouter = (store = adminStore, verify = verifyAdminToken) => {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.use(async (req, res, next) => {
    const token = /^Bearer\s+([^\s]{1,4096})$/iu.exec(req.header("authorization") || "")?.[1];
    if (!token) return res.status(401).json({ code: "AUTH_REQUIRED", error: "로그인이 필요합니다." });
    try {
      const admin = await verify(token);
      if (!admin) return res.status(403).json({ code: "ADMIN_REQUIRED", error: "관리자 권한이 없는 계정입니다." });
      res.locals.adminUid = admin.id;
      next();
    } catch (error) { next(error); }
  });
  const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void handler(req, res).catch(next); };
  const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
  const invalid = () => { throw new OperationsError(400, "INVALID_REQUEST", "요청 내용을 확인해 주세요."); };
  const queryString = (value: unknown, max = 2048) => {
    if (value === undefined) return "";
    if (typeof value !== "string" || value.length > max) return invalid();
    return value.trim();
  };
  router.get("/session", route(async (_req, res) => res.json({ uid: res.locals.adminUid })));
  router.get("/overview", route(async (_req, res) => res.json(await store.overview())));
  router.get("/settings", route(async (_req, res) => res.json({ settings: await store.getSettings(), models: AI_MODEL_CATALOG })));
  router.put("/settings", route(async (req, res) => res.json({ settings: await store.saveSettings(res.locals.adminUid, req.body) })));
  router.get("/users", route(async (req, res) => res.json(await store.users(queryString(req.query.search, 320), queryString(req.query.cursor) || undefined))));
  router.patch("/users/:uid", route(async (req, res) => {
    if (!object(req.body) || Object.keys(req.body).length !== 1 || typeof req.body.aiBlocked !== "boolean") return invalid();
    await store.updateUser(res.locals.adminUid, String(req.params.uid), req.body.aiBlocked);
    return res.json({ ok: true });
  }));
  router.get("/reports", route(async (req, res) => res.json(await store.reports(queryString(req.query.cursor) || undefined))));
  router.patch("/reports/:uid/:id", route(async (req, res) => {
    if (!object(req.body) || Object.keys(req.body).sort().join(",") !== "note,revision,status" ||
      typeof req.body.status !== "string" || !["received", "reviewing", "resolved"].includes(req.body.status) || typeof req.body.note !== "string" || req.body.note.length > 2000 ||
      !Number.isSafeInteger(req.body.revision) || Number(req.body.revision) < 0) return invalid();
    await store.updateReport(res.locals.adminUid, String(req.params.uid), String(req.params.id), req.body.status as "received" | "reviewing" | "resolved", req.body.note.trim(), Number(req.body.revision));
    return res.json({ ok: true });
  }));
  router.get("/audit", route(async (_req, res) => res.json({ items: await store.audit() })));
  router.get("/billing", route(async (_req, res) => res.json({ connected: false, provider: null, payments: [], refunds: [] })));
  router.use((_req, res) => res.status(404).json({ code: "NOT_FOUND", error: "관리자 기능을 찾지 못했습니다." }));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof OperationsError) return res.status(error.status).json({ code: error.code, error: error.message });
    console.error(JSON.stringify({ event: "admin_request_failed", requestId: res.locals.requestId, code: "ADMIN_UNAVAILABLE" }));
    return res.status(503).json({ code: "ADMIN_UNAVAILABLE", error: "운영 정보를 불러오거나 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  });
  return router;
};
