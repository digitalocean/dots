import nock from "nock";
import { JsonObjectReader } from "../../src/dots/sandbox/commands.js";
import { NotFoundError, Sandbox, SandboxError } from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const ID = "sb-1";
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const b64 = (s: string) => Buffer.from(s).toString("base64");
const line = (result: unknown) => JSON.stringify({ result }) + "\n";
const raw = {
    sandbox_id: ID,
    template: "coding-base",
    state: "SANDBOX_STATE_RUNNING",
    size_slug: "mars-2vcpu-4gb",
    created_at: "2026-11-20T12:00:00Z",
};

async function sandbox(): Promise<Sandbox> {
    api().get(`/v2/sandboxes/${ID}`).reply(200, { sandbox: raw });
    return Sandbox.get(ID, OPTS);
}

describe("Sandbox commands", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("start sends the executable and returns a handle on the pid", async () => {
        const sb = await sandbox();
        api()
            .post(`/v2/sandboxes/${ID}/commands`, {
                cmd: "sleep",
                args: ["60"],
                cwd: "/workspace",
                env_vars: { A: "1" },
                stdin: true,
                timeout_seconds: "30",
            })
            .reply(200, { pid: 42 });
        const cmd = await sb.commands.start("sleep", {
            args: ["60"],
            cwd: "/workspace",
            envVars: { A: "1" },
            stdin: true,
            timeoutSeconds: 30,
        });
        expect(cmd.pid).toBe(42);
        expect(nock.isDone()).toBe(true);
    });

    it("start rejects an empty command before sending", async () => {
        const sb = await sandbox();
        await expect(sb.commands.start(" ")).rejects.toThrow(/cmd/);
    });

    it("list returns the running commands", async () => {
        const sb = await sandbox();
        api()
            .get(`/v2/sandboxes/${ID}/commands`)
            .reply(200, { commands: [{ pid: 42, cmd: "bash", cwd: "/workspace" }, { pid: 43, cmd: "sleep" }] });
        expect(await sb.commands.list()).toEqual([
            { pid: 42, cmd: "bash", cwd: "/workspace" },
            { pid: 43, cmd: "sleep", cwd: undefined },
        ]);
    });

    it("run starts bash -lc and collects stdout, stderr and the exit code", async () => {
        const sb = await sandbox();
        api()
            .post(`/v2/sandboxes/${ID}/commands`, { cmd: "bash", args: ["-lc", 'echo "Hello"'], cwd: "/w" })
            .reply(200, { pid: 42 });
        api()
            .get(`/v2/sandboxes/${ID}/commands/42/stream`)
            .reply(
                200,
                line({ started: { pid: 42 } }) +
                    line({ stdout: b64("Hel") }) +
                    line({ keepalive: {} }) +
                    line({ stdout: b64("lo\n") }) +
                    line({ stderr: b64("warn\n") }) +
                    line({ exit: { exit_code: 3, status: "exited" } }),
            );
        const out: string[] = [];
        const err: string[] = [];
        const result = await sb.commands.run('echo "Hello"', {
            cwd: "/w",
            onStdout: (t) => out.push(t),
            onStderr: (t) => err.push(t),
        });
        expect(result).toMatchObject({ pid: 42, exitCode: 3, stdout: "Hello\n", stderr: "warn\n", status: "exited" });
        expect(out).toEqual(["Hel", "lo\n"]);
        expect(err).toEqual(["warn\n"]);
        expect(nock.isDone()).toBe(true);
    });

    it("decodes multi-byte text that is split across chunks", async () => {
        const sb = await sandbox();
        const bytes = Buffer.from("héllo", "utf8"); // é is two bytes
        api().get(`/v2/sandboxes/${ID}/commands/42/stream`).reply(
            200,
            line({ stdout: bytes.subarray(0, 2).toString("base64") }) +
                line({ stdout: bytes.subarray(2).toString("base64") }) +
                line({ exit: { exit_code: 0 } }),
        );
        const result = await sb.commands.connect(42).wait();
        expect(result.stdout).toBe("héllo");
    });

    it("stream yields typed events and drops keepalives", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands/42/stream`).reply(
            200,
            line({ started: { pid: 42 } }) + line({ keepalive: {} }) + line({ stdout: b64("a") }) + line({ exit: { exit_code: 0 } }),
        );
        const types: string[] = [];
        for await (const e of sb.commands.connect(42).stream()) types.push(e.type);
        expect(types).toEqual(["started", "stdout", "exit"]);
    });

    it("a stream that ends before the exit event is an error, not a guess", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands/42/stream`).reply(200, line({ stdout: b64("partial") }));
        await expect(sb.commands.connect(42).wait()).rejects.toThrow(/ended before the command exited/);
    });

    it("an exit with an error is returned in the result", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands/42/stream`).reply(
            200,
            line({ exit: { exit_code: 137, status: "killed", error: "out of memory" } }),
        );
        expect(await sb.commands.connect(42).wait()).toMatchObject({ exitCode: 137, error: "out of memory" });
    });

    it("an unknown or exited pid is a NotFoundError that says why", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands/99/stream`).reply(404, { id: "not_found", message: "not found", request_id: "r" });
        const err = await sb.commands.connect(99).wait().catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.status).toBe(404);
        expect(err.requestId).toBe("r");
        expect(err.message).toMatch(/already exited/);
    });

    it("a stream error envelope is raised", async () => {
        const sb = await sandbox();
        api().get(`/v2/sandboxes/${ID}/commands/42/stream`).reply(
            200,
            line({ started: { pid: 42 } }) + JSON.stringify({ error: { http_code: 500, message: "gateway failed" } }) + "\n",
        );
        const err = await sb.commands.connect(42).wait().catch((e) => e);
        expect(err).toBeInstanceOf(SandboxError);
        expect(err.message).toBe("gateway failed");
        expect(err.status).toBe(500);
    });

    it("writeStdin sends base64 data and eof; closeStdin sends only eof", async () => {
        const sb = await sandbox();
        const cmd = sb.commands.connect(42);
        api().post(`/v2/sandboxes/${ID}/commands/42/stdin`, { data: b64("hello\n"), eof: true }).reply(200, {});
        await cmd.writeStdin("hello\n", { eof: true });
        api().post(`/v2/sandboxes/${ID}/commands/42/stdin`, { data: b64("raw"), eof: false }).reply(200, {});
        await cmd.writeStdin(new Uint8Array([114, 97, 119]), { eof: false });
        api().post(`/v2/sandboxes/${ID}/commands/42/stdin`, { eof: true }).reply(200, {});
        await cmd.closeStdin();
        expect(nock.isDone()).toBe(true);
    });

    it("kill sends SIGTERM by default and SIGKILL on request", async () => {
        const sb = await sandbox();
        const cmd = sb.commands.connect(42);
        api().post(`/v2/sandboxes/${ID}/commands/42/signal`, { signal: "SANDBOX_COMMAND_SIGNAL_SIGTERM" }).reply(200, {});
        await cmd.kill();
        api().post(`/v2/sandboxes/${ID}/commands/42/signal`, { signal: "SANDBOX_COMMAND_SIGNAL_SIGKILL" }).reply(200, {});
        await cmd.kill("SIGKILL");
        await expect(cmd.kill("SIGHUP" as any)).rejects.toThrow(/unsupported signal/);
        expect(nock.isDone()).toBe(true);
    });

    it("an HTML reply (a gateway 404 page) is a typed error with the status, not a parser failure", async () => {
        const sb = await sandbox();
        const html = "<html><body><h1>404 page not found</h1></body></html>";
        api().post(`/v2/sandboxes/${ID}/commands`).reply(404, html, { "content-type": "text/html" });
        const err = await sb.commands.run("echo hi").catch((e) => e);
        expect(err).toBeInstanceOf(NotFoundError);
        expect(err.status).toBe(404);
        expect(err.message).toMatch(/unexpected text\/html response \(HTTP 404\) from POST .*\/commands: .*404 page not found/);
        expect(err.message).not.toMatch(/factory registered/);

        api().get(`/v2/sandboxes/${ID}/commands`).reply(200, "<html>login</html>", { "content-type": "text/html; charset=utf-8" });
        await expect(sb.commands.list()).rejects.toThrow(/unexpected text\/html response \(HTTP 200\)/);
        api().get(`/v2/sandboxes/${ID}/commands`).reply(502, "bad gateway", { "content-type": "text/plain" });
        await expect(sb.commands.list()).rejects.toMatchObject({ status: 502, name: "ServiceError" });
    });

    it("API errors on start, list and signal are typed", async () => {
        const sb = await sandbox();
        api().post(`/v2/sandboxes/${ID}/commands`).reply(404, { id: "not_found", message: "Sandbox not found for your team." });
        await expect(sb.commands.start("ls")).rejects.toBeInstanceOf(NotFoundError);
        api().get(`/v2/sandboxes/${ID}/commands`).reply(403, { id: "forbidden", message: "no" });
        await expect(sb.commands.list()).rejects.toMatchObject({ status: 403 });
    });
});

describe("JsonObjectReader", () => {
    it("splits newline-delimited and back-to-back objects", () => {
        const r = new JsonObjectReader();
        expect(r.push('{"a":1}\n{"b":2}{"c":3}\n')).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
    });

    it("keeps a partial object for the next chunk", () => {
        const r = new JsonObjectReader();
        expect(r.push('{"a":{"x":')).toEqual([]);
        expect(r.push('1}}\n{"b"')).toEqual([{ a: { x: 1 } }]);
        expect(r.push(":2}")).toEqual([{ b: 2 }]);
    });

    it("ignores braces and escaped quotes inside strings", () => {
        const r = new JsonObjectReader();
        expect(r.push('{"s":"} { \\" }"}{"t":"x"}')).toEqual([{ s: '} { " }' }, { t: "x" }]);
    });
});
