/**
 * Read and write files in a sandbox with the files API, with a fallback.
 *
 *   npx tsx examples/sandbox/06-files.ts
 *
 * Needs DIGITALOCEAN_ACCESS_TOKEN (and DIGITALOCEAN_API_URL for a non-default API address).
 * You should see the files API steps. On the internal test API the files API is not
 * available yet (ConflictError or NotFoundError), so you see a message saying so and then
 * a file written and read back through exec and base64. The script exits 0 either way.
 * Downstream code imports from "@digitalocean/dots/sandbox" instead of the relative path.
 */
import { ConflictError, NotFoundError, Sandbox } from "../../src/dots/sandbox/index.js";

await using sbx = await Sandbox.create();
process.once("SIGINT", () => void sbx.kill().finally(() => process.exit(130)));

try {
    await sbx.files.makeDir("/tmp/demo");
    await sbx.files.write("/tmp/demo/hello.txt", "hello from files\n");
    console.log("read_text:", JSON.stringify(await sbx.files.readText("/tmp/demo/hello.txt")));
    console.log("exists:   ", await sbx.files.exists("/tmp/demo/hello.txt"));
    await sbx.files.move("/tmp/demo/hello.txt", "/tmp/demo/renamed.txt");
    const entries = await sbx.files.list("/tmp/demo");
    console.log("list:     ", entries.map((e) => `${e.name} (${e.type}, ${e.size} bytes)`).join(", "));
    await sbx.files.remove("/tmp/demo/renamed.txt");
    console.log("files API works: write, read, list, move and remove all succeeded");
} catch (err) {
    if (!(err instanceof ConflictError || err instanceof NotFoundError)) throw err;
    console.log(`The files API is not available on this template yet (${err.name}: ${err.message}).`);
    console.log("Fallback: write and read a file through exec and base64.");
    await fallback();
}

// Fallback helpers. base64 keeps any content safe from shell quoting.
async function writeFile(path: string, text: string): Promise<void> {
    const b64 = Buffer.from(text).toString("base64");
    await sbx.exec(`mkdir -p "$(dirname "$P")" && echo "$B64" | base64 -d > "$P"`, {
        env: { P: path, B64: b64 },
        check: true,
    });
}

async function readFile(path: string): Promise<string> {
    const result = await sbx.exec(`base64 "$P"`, { env: { P: path }, check: true });
    return Buffer.from(result.stdout, "base64").toString();
}

async function fallback(): Promise<void> {
    await writeFile("/tmp/demo/hello.txt", "hello from the fallback\n");
    console.log("read back:", JSON.stringify(await readFile("/tmp/demo/hello.txt")));
    const listing = await sbx.exec("ls -l /tmp/demo", { check: true });
    console.log(listing.stdout.trim());
}
