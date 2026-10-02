const HANDLER_MARK = Symbol.for("learnhub.unhandled-rejection-handler");
type MarkedProcess = NodeJS.Process & { [HANDLER_MARK]?: boolean };
export function installUnhandledRejectionLogger(): void {
  const runtime = process as MarkedProcess;
  if (runtime[HANDLER_MARK]) return;
  runtime[HANDLER_MARK] = true;
  // Do not log SDK credentials, tokens, request bodies or raw provider errors.
  runtime.on("unhandledRejection", (reason: unknown) => {
    const missingCredentials = reason instanceof Error && /default credentials|credentials.*not.*found/iu.test(reason.message);
    console.error(JSON.stringify({ event: "unhandled_rejection", code: missingCredentials ? "cloud_store_unavailable" : "background_operation_failed" }));
  });
}
