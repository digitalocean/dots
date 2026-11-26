/**
 * box.files: copy files in and out of the agent session's /workspace (harness files API).
 *
 *   npx tsx examples/agentSandbox/04-files.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see a file uploaded and read back, then a local file copied in and out.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");
await using box = await Sandbox.create({ manifest });

// upload takes a string, bytes, a Blob or a stream. Paths are relative to /workspace.
await box.files.upload("notes/hello.txt", "hello from the harness API\n");

// downloadText reads it as UTF-8, and download returns the bytes (up to 50 MiB, checksum-verified).
console.log((await box.files.downloadText("notes/hello.txt")).trim());
const bytes = await box.files.download("notes/hello.txt");
console.log(`downloaded ${bytes.length} bytes`);

// A local file of any size (up to 50 GiB) goes through copyFromLocal and copyToLocal.
const dir = await mkdtemp(join(tmpdir(), "agent-sandbox-"));
await writeFile(join(dir, "local.txt"), "copied in\n");
await box.files.copyFromLocal(join(dir, "local.txt"), "local.txt");
await box.files.copyToLocal("local.txt", join(dir, "back.txt")); // checked against the server's SHA-256
console.log("copied back:", (await readFile(join(dir, "back.txt"), "utf8")).trim());

// There is no list, move, exists or makeDir here: that is the bare sandbox's files API. Use exec instead.
console.log((await box.exec("find /workspace -type f")).stdout.trim());
