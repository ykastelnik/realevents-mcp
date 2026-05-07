import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve("dist/index.js");
const shebang = "#!/usr/bin/env node\n";

const current = readFileSync(target, "utf8");
if (!current.startsWith(shebang)) {
  writeFileSync(target, shebang + current, "utf8");
}
chmodSync(target, 0o755);
