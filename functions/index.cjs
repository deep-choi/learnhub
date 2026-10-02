const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const openAiApiKey = defineSecret("OPENAI_API_KEY");
let app;

exports.learnhubApi = onRequest(
  {
    region: "asia-northeast3",
    invoker: "public",
    minInstances: 0,
    maxInstances: 1,
    concurrency: 20,
    timeoutSeconds: 120,
    memory: "1GiB",
    secrets: [geminiApiKey, openAiApiKey],
  },
  (req, res) => {
    app ||= require("./server.cjs").app;
    return app(req, res);
  },
);
