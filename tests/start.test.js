"use strict";
// Starts the real server process: boot, health check, graceful SIGTERM shutdown and port-in-use error.
import { test } from "node:test";
import assert from "node:assert";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { spawn } from "node:child_process";

const SERVER = path.join(__dirname, "..", "server.js");

const freePort = () =>
  new Promise((resolve) => {
    const probe = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

function boot(port) {
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { out: "", err: "" };
  child.stdout.on("data", (c) => {
    output.out += c;
  });
  child.stderr.on("data", (c) => {
    output.err += c;
  });
  const exited = new Promise((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal })),
  );
  return { child, output, exited };
}

async function waitForHealth(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (res.ok) return res;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

test("the server boots, answers /healthz and shuts down cleanly on SIGTERM", async () => {
  const port = await freePort();
  const { child, output, exited } = boot(port);
  const res = await waitForHealth(port);
  assert.deepStrictEqual(await res.json(), { status: "ok" });
  assert.match(output.out, /Smog Companion running at/);
  child.kill("SIGTERM");
  const shutdown = await exited;
  assert.ok(shutdown.code === 0 || shutdown.signal === "SIGTERM");
});

test("starting on a busy port explains the problem and exits with an error", async () => {
  const port = await freePort();
  const first = boot(port);
  await waitForHealth(port);
  const second = boot(port);
  const result = await second.exited;
  assert.strictEqual(result.code, 1);
  assert.match(second.output.err, /already in use/);
  first.child.kill("SIGTERM");
  await first.exited;
});
