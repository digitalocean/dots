/**
 * box.files: the sandbox API's files calls (`/v2/sandboxes/{sandboxId}/files/...`), on the agent session's
 * sandbox. For the harness API's files (upload, download, copyFromLocal, copyToLocal) use `box.agent.files`.
 *
 *   npx tsx examples/agentSandbox/04-files.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see a file written and read back, then listed and moved, then the harness files API copy a local file.
 * The sandbox files API is not available on every template yet: you then see the error it raised.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConflictError, NotFoundError, Sandbox } from "../../src/dots/sandbox/index.js";

const manifest = readFileSync(new URL("../harness-runtime/agent.yaml", import.meta.url), "utf8");
await using box = await Sandbox.create({ manifest });

// Sandbox API: absolute paths, and list, move, exists and makeDir.
try {
    await box.files.makeDir("/workspace/notes");
    await box.files.write("/workspace/notes/hello.txt", "hello from the sandbox API\n");
    console.log((await box.files.readText("/workspace/notes/hello.txt")).trim());
    console.log("exists", await box.files.exists("/workspace/notes/hello.txt"));
    await box.files.move("/workspace/notes/hello.txt", "/workspace/notes/renamed.txt");
    console.log((await box.files.list("/workspace/notes")).map((e) => e.name).join(", "));
    await box.files.remove("/workspace/notes/renamed.txt");
} catch (err) {
    if (!(err instanceof ConflictError || err instanceof NotFoundError)) throw err;
    console.log(`the sandbox files API is not available here (${err.name}: ${err.message})`);
}

// Harness API: box.agent.files copies files of any size, relative to /workspace, with checksums.
const dir = await mkdtemp(join(tmpdir(), "agent-sandbox-"));
await writeFile(join(dir, "local.txt"), "copied in\n");
await box.agent.files.copyFromLocal(join(dir, "local.txt"), "local.txt");
await box.agent.files.copyToLocal("local.txt", join(dir, "back.txt"));
console.log("copied back:", (await readFile(join(dir, "back.txt"), "utf8")).trim());
