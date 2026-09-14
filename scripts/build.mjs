import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const output = new URL("../dist/", import.meta.url);
const source = new URL("../site/", import.meta.url);

await mkdir(output, { recursive: true });
for (const entry of await readdir(output)) {
  await rm(join(fileURLToPath(output), entry), { recursive: true, force: true });
}
await cp(source, output, { recursive: true });
