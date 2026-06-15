import fs from "node:fs/promises";
import path from "node:path";

const source = path.resolve("apps/extension/public");
const target = path.resolve("dist/apps/extension");

await fs.cp(source, target, { recursive: true });
await fs.cp(
  path.resolve("apps/backend/public"),
  path.resolve("dist/apps/backend/public"),
  { recursive: true },
);

await fs.mkdir(path.join(target, "background"), { recursive: true });
await fs.mkdir(path.join(target, "content"), { recursive: true });
await fs.mkdir(path.join(target, "ui"), { recursive: true });

await fs.copyFile(
  path.resolve("dist/apps/extension/src/background/serviceWorker.js"),
  path.join(target, "background/serviceWorker.js"),
);
await fs.copyFile(
  path.resolve("dist/apps/extension/src/content/scanner.js"),
  path.join(target, "content/scanner.js"),
);
await fs.copyFile(
  path.resolve("dist/apps/extension/src/content/filler.js"),
  path.join(target, "content/filler.js"),
);
await fs.copyFile(
  path.resolve("dist/apps/extension/src/ui/sidepanel.js"),
  path.join(target, "ui/sidepanel.js"),
);
