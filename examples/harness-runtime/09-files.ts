/**
 * Move files in and out of a session, at any size.
 *
 *   DIGITALOCEAN_TOKEN=... npx tsx examples/harness-runtime/09-files.ts [local-file]
 *
 * Without a file, it writes a 60 MiB file of random bytes, so the upload goes
 * through a staged transfer (anything over 50 MiB does).
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();

let local = process.argv[2];
if (!local) {
    local = join(await mkdtemp(join(tmpdir(), "harness-files-")), "data.bin");
    await writeFile(local, randomBytes(60 * 1024 * 1024));
}

const session = await hr.sessions.create({ manifest: { harness: "sandbox" } });
try {
    // Small files: a string or bytes, straight through the API.
    await session.files.upload("hello.txt", "hello from the SDK\n");
    console.log(await session.files.downloadText("hello.txt"));

    // A local file of any size, up to 50 GiB. Over 50 MiB it is staged through object storage.
    await session.files.copyFromLocal(local, "data.bin");
    console.log((await session.exec(["ls", "-l", "data.bin"])).stdout);

    // And back, checked against the SHA-256 the server reports.
    await session.files.copyToLocal("data.bin", `${local}.copy`);
    console.log(`copied back to ${local}.copy`);

    // Or as a stream, to pipe somewhere else without holding it in memory.
    const reader = (await session.files.download("data.bin", { format: "stream" })).getReader();
    let bytes = 0;
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) bytes += chunk.value.length;
    console.log(`streamed ${bytes} bytes`);
} finally {
    await session.destroy();
}
