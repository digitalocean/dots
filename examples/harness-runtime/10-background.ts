/**
 * Run a server in the background and talk to it with other commands.
 *
 *   DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/10-background.ts
 *
 * Downstream code imports from "@digitalocean/dots/harness-runtime" instead of the relative path.
 */
import { HarnessRuntime } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();

// `await using` destroys the session when this script ends (see "Versions" in the README).
await using session = await hr.sessions.create({ manifest: { harness: "sandbox" } });
await session.files.upload("site/index.html", "<h1>Hello from a background server</h1>\n");

// spawn returns while the command runs. Leaving this scope kills it, before the
// session is destroyed. python3's server logs each request to stderr.
await using server = await session.spawn(["python3", "-m", "http.server", "8080"], {
    cwd: "/workspace/site",
    onStderr: (text) => process.stderr.write(`[server] ${text}`),
});

// Meanwhile, run other commands. `env` applies to that one command only.
const page = await session.exec(
    'for i in $(seq 20); do curl -sf "http://localhost:$PORT/" && exit 0; sleep 0.5; done; exit 1',
    { env: { PORT: "8080" } },
);
console.log(page.exitCode === 0 ? page.stdout : `the server did not answer:\n${page.stderr}`);

// The next command does not see PORT: it was not stored on the session.
console.log((await session.exec('echo "PORT is ${PORT:-not set}"')).stdout);

// Stop the server now rather than at the end of the script.
server.kill();
