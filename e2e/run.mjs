import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const databaseName = `jaa_e2e_${process.pid}`;
const databaseUrl = `postgres://jobapply:jobapply_dev@localhost:5432/${databaseName}`;
const baseUrl = "http://localhost:4327";
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "jaa-e2e-"));
const extensionPath = path.join(tempRoot, "extension");
let server;
let exitCode = 1;

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the E2E backend.");
}

try {
  command("docker", ["compose", "up", "-d", "postgres"]);
  command("docker", ["compose", "exec", "-T", "postgres", "createdb", "-U", "jobapply", databaseName]);
  command("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  cpSync(path.join(root, "dist/apps/extension"), extensionPath, { recursive: true });
  const manifestPath = path.join(extensionPath, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.host_permissions = [
    ...(manifest.host_permissions ?? []),
    `${baseUrl}/*`,
    "http://greenhouse.localhost:4327/*",
    "http://lever.localhost:4327/*",
    "http://workday.localhost:4327/*",
    "http://pinpoint.localhost:4327/*",
    "http://privacy.localhost:4327/*",
  ];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  server = spawn(process.execPath, ["dist/apps/backend/src/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      SKIP_DOTENV: "true",
      NODE_ENV: "test",
      PORT: "4327",
      DATABASE_URL: databaseUrl,
      PUBLIC_BASE_URL: baseUrl,
      AI_PROVIDER: "mock",
      AI_FALLBACK_PROVIDER: "none",
    },
    stdio: "inherit",
  });
  await waitForServer();

  const result = spawnSync("npx", ["playwright", "test", "--config", "e2e/playwright.config.ts"], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      E2E_BASE_URL: baseUrl,
      E2E_EXTENSION_PATH: extensionPath,
    },
    stdio: "inherit",
  });
  exitCode = result.status ?? 1;
} finally {
  if (server && !server.killed) server.kill("SIGTERM");
  spawnSync("docker", ["compose", "exec", "-T", "postgres", "dropdb", "--if-exists", "-U", "jobapply", databaseName], {
    cwd: root,
    stdio: "inherit",
  });
  rmSync(tempRoot, { recursive: true, force: true });
}

process.exitCode = exitCode;
