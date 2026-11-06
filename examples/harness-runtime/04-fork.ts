/**
 * Fork an agent to try two approaches from the same starting point.
 *
 *   DIGITALOCEAN_ACCESS_TOKEN=... npx tsx examples/harness-runtime/04-fork.ts
 *
 * The first session writes some code and takes a checkpoint. Two forks start
 * from that checkpoint and each takes a different approach, in parallel.
 */
import { readFileSync } from "node:fs";
import { HarnessRuntime, type Session } from "../../src/dots/harnessRuntime/index.js";

const hr = new HarnessRuntime();
// Ctrl-C stops the wait below, so the cleanup still runs. A second Ctrl-C quits at once.
const interrupt = new AbortController();
process.once("SIGINT", () => interrupt.abort(new Error("interrupted")));
const manifest = readFileSync(process.env.HARNESS_MANIFEST ?? new URL("./agent.yaml", import.meta.url), "utf8");

const session = await hr.sessions.create({ manifest });
const forks: Session[] = [];
try {
    await session.run("Create /workspace/calc.py with a function add(a, b). Do not write tests.", {
        signal: interrupt.signal,
    });
    const checkpoint = await session.checkpoint({ label: "before-tests" });
    forks.push(...(await session.fork({ from: checkpoint, count: 2 })));

    const [unittest, pytest] = await Promise.all([
        forks[0].run("Add tests for calc.py using unittest, run them, and report the result.", { signal: interrupt.signal }),
        forks[1].run("Add tests for calc.py using pytest, run them, and report the result.", { signal: interrupt.signal }),
    ]);
    console.log(`unittest branch (${unittest.status}):\n${unittest.text}\n`);
    console.log(`pytest branch (${pytest.status}):\n${pytest.text}`);
} finally {
    await Promise.all([session, ...forks].map((s) => s.destroy().catch(() => undefined)));
}
