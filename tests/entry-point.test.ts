import { execFileSync } from "node:child_process";
import { mkdtempSync, symlinkSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist", "index.js");

const HANDSHAKE = [
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    }
  }),
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
  ""
].join("\n");

function listToolsVia(entryPath: string): string[] {
  const out = execFileSync("node", [entryPath], {
    input: HANDSHAKE,
    encoding: "utf8",
    timeout: 20_000
  });
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const message = JSON.parse(line) as {
      id?: number;
      result?: { tools?: { name: string }[] };
    };
    if (message.id === 2) return (message.result?.tools ?? []).map((t) => t.name).sort();
  }
  return [];
}

// The binary only starts its transport when it IS the process entry point, so that
// importing the module (the wiring test does) does not open a stdio connection.
// Getting that check wrong ships a server that starts, exits silently, and answers
// nothing - which unit tests cannot see, because they never run the binary.
describe("binary entry point", () => {
  // These tests run the BUILT binary, so they need dist/. CI runs the test job
  // without a build step (build happens only in the publish workflow), and locally
  // dist/ may be stale or absent - so build it here rather than depending on
  // whatever happens to be on disk. Passing only because of a leftover build is
  // exactly the kind of hidden state this file exists to catch.
  beforeAll(() => {
    // Always build, never "build only if missing": a stale dist/ would let these
    // tests pass against yesterday's binary, which is the same class of hidden
    // state they exist to catch.
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", timeout: 120_000 });
    expect(existsSync(DIST)).toBe(true);
  }, 130_000);

  it("serves tools/list when run directly", () => {
    expect(listToolsVia(DIST)).toContain("create_event");
  });

  // import.meta.url resolves symlinks; process.argv[1] does not. On macOS every
  // path under /tmp is really /private/tmp, so comparing the two raw made the
  // server silently refuse to start whenever it was installed beneath a symlink -
  // which is exactly what `npm install` into a /tmp project produces.
  it("still serves tools/list when reached through a symlinked path", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-entry-"));
    const link = join(dir, "linked-index.js");
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- link is inside a mkdtemp dir created above, not user input
      symlinkSync(DIST, link);
      expect(listToolsVia(link)).toContain("create_event");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
