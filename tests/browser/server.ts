process.env.DISABLE_HMR = "true";
process.env.NODE_ENV = "test";
const { app } = await import("../../server");
const { createServer } = await import("vite");
const { default: react } = await import("@vitejs/plugin-react");
const { default: tailwindcss } = await import("@tailwindcss/vite");
const vite = await createServer({
  configFile: false,
  plugins: [react(), tailwindcss()],
  define: { __LEARNHUB_FIREBASE_CONFIG__: "null" },
  server: { middlewareMode: true, hmr: { port: 24693, host: "127.0.0.1" } },
  appType: "spa",
});
app.use(vite.middlewares);
app.listen(3013, "127.0.0.1", () =>
  console.log("Study browser fixture: http://localhost:3013"),
);
