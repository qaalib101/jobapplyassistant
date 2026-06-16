import cors from "cors";
import express from "express";
import path from "node:path";
import { config } from "./config";
import { router } from "./routes";

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin.startsWith("chrome-extension://")) {
        callback(null, true);
        return;
      }
      if (config.extensionOrigin && origin === config.extensionOrigin) {
        callback(null, true);
        return;
      }
      if (origin === config.publicBaseUrl) {
        callback(null, true);
        return;
      }
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      if (/^https?:\/\/jobapply\.localhost(:\d+)?$/.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`));
    },
  }),
);

app.use("/api", router);

const frontendDist = path.resolve(process.cwd(), "dist/apps/frontend");
const frontendSource = path.resolve(process.cwd(), "apps/frontend/public");

app.use(express.static(frontendDist));
app.use(express.static(frontendSource));
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ error: message });
  },
);

app.listen(config.port, () => {
  console.log(`Job Apply Assistant API listening on http://localhost:${config.port}`);
});
