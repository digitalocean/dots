import { Readable } from "node:stream";
import nock from "nock";
import { CommandError, InvalidRequestError, Sandbox, SandboxError, ServiceError } from "../../src/dots/sandbox/index.js";

const API = "https://api.digitalocean.com";
const OPTS = { token: "test-token" };
const ID = "sb-1";
const JSON_TYPE = { "Content-Type": "application/json" };
const api = () => nock(API, { reqheaders: { authorization: "Bearer test-token" } });
const b64 = (s: string) => Buffer.from(s).toString("base64");
const line = (result: unknown) => JSON.stringify({ result }) + "\n";
const EXEC = `/v2/sandboxes/${ID}/exec`;

async function sandbox(): Promise<Sandbox> {
    api()
        .get(`/v2/sandboxes/${ID}`)
        .reply(200, {
            sandbox: { sandbox_id: ID, template: "coding-base", state: "SANDBOX_STATE_RUNNING", created_at: "2026-11-20T12:00:00Z" },
        });
    return Sandbox.get(ID, OPTS);
}

/** Replies to POST /exec with the given body, capturing the request body. */
function execReply(body: string | Readable, seen?: { body?: unknown }) {
    return api()
        .post(EXEC, (b) => {
            if (seen) seen.body = b;
            return true;
        })
        .reply(200, () => body, JSON_TYPE);
}

describe("Sandbox exec", () => {
    beforeEach(() => {
        delete process.env.DIGITALOCEAN_ACCESS_TOKEN;
        delete process.env.DIGITALOCEAN_API_URL;
    });
    afterEach(() => nock.cleanAll());

    it("run sends bash -lc and collects stdout, stderr, the exit code and duration", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(
            line({ stderr: b64("oops\n") }) + line({ stdout: b64("hello\n") }) + line({ exit: { exit_code: 3, duration_ms: "39" } }),
            seen,
        );
        const out: string[] = [];
        const err: string[] = [];
        const result = await sb.exec.run("echo hello; echo oops >&2; exit 3", {
            onStdout: (t) => out.push(t),
            onStderr: (t) => err.push(t),
        });
        expect(seen.body).toEqual({ argv: ["bash", "-lc", "echo hello; echo oops >&2; exit 3"] });
        expect(result).toEqual({ exitCode: 3, ok: false, stdout: "hello\n", stderr: "oops\n", durationMs: 39, status: undefined, error: undefined });
        expect(out).toEqual(["hello\n"]);
        expect(err).toEqual(["oops\n"]);
        expect(nock.isDone()).toBe(true);
    });

    it("sandbox.exec is callable: it runs the command like exec.run and reports ok", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(line({ stdout: b64("hi\n") }) + line({ exit: { duration_ms: "7" } }), seen);
        const result = await sb.exec("echo hi");
        expect(seen.body).toEqual({ argv: ["bash", "-lc", "echo hi"] });
        expect(result).toMatchObject({ exitCode: 0, ok: true, stdout: "hi\n" });
        expect(typeof sb.exec.run).toBe("function");
        expect(typeof sb.exec.start).toBe("function");
    });

    it("exec() takes env and a duration timeout, as the docs show", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(line({ exit: {} }), seen);
        await sb.exec("pytest -x", { cwd: "/workspace", env: { CI: "1" }, timeout: "2m" });
        expect(seen.body).toEqual({
            argv: ["bash", "-lc", "pytest -x"],
            workdir: "/workspace",
            env_vars: { CI: "1" },
            timeout_seconds: "120",
        });
    });

    it("exec() does not throw on a non-zero exit, and check: true throws CommandError with the result", async () => {
        const sb = await sandbox();
        execReply(line({ stderr: b64("boom") }) + line({ exit: { exit_code: 2 } }));
        const failed = await sb.exec("false");
        expect(failed).toMatchObject({ exitCode: 2, ok: false, stderr: "boom" });

        execReply(line({ stderr: b64("boom") }) + line({ exit: { exit_code: 2 } }));
        const err = await sb.exec("false", { check: true }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(CommandError);
        expect(err).toBeInstanceOf(SandboxError);
        expect((err as CommandError<{ exitCode: number }>).result.exitCode).toBe(2);
        expect((err as Error).message).toBe("command exited with code 2");
    });

    it("exec() validates env/timeout options before sending", async () => {
        const sb = await sandbox();
        await expect(sb.exec("ls", { timeout: "soon" })).rejects.toThrow(/timeout/);
        await expect(sb.exec("ls", { timeout: -1 })).rejects.toThrow(/timeout/);
        await expect(sb.exec("ls", { env: { A: "1" }, envVars: { B: "2" } })).rejects.toThrow(/env/);
        await expect(sb.exec("ls", { timeout: 5, timeoutSeconds: 5 })).rejects.toThrow(/timeout/);
        await expect(sb.exec("ls", { nope: 1 } as never)).rejects.toThrow(/unsupported option/);
    });

    it("an exit without exit_code is 0", async () => {
        const sb = await sandbox();
        execReply(line({ stdout: b64("ok") }) + line({ exit: { duration_ms: "5" } }));
        expect(await sb.exec.run(["true"])).toMatchObject({ exitCode: 0, stdout: "ok", durationMs: 5 });
    });

    it("an argv array is sent as is, with the other options in wire form", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(line({ exit: {} }), seen);
        await sb.exec.run(["python3", "-c", "print(1)"], {
            cwd: "/workspace",
            envVars: { A: "1" },
            timeoutSeconds: 30,
            stdin: "first",
        });
        expect(seen.body).toEqual({
            argv: ["python3", "-c", "print(1)"],
            workdir: "/workspace",
            env_vars: { A: "1" },
            timeout_seconds: "30",
            stdin: b64("first"),
        });
    });

    it("parses envelopes split across chunks and back to back, drops keepalives, decodes split UTF-8", async () => {
        const sb = await sandbox();
        const bytes = Buffer.from("héllo", "utf8"); // é is two bytes
        const all =
            line({ keepalive: {} }) +
            JSON.stringify({ result: { stdout: bytes.subarray(0, 2).toString("base64") } }) +
            JSON.stringify({ result: { stdout: bytes.subarray(2).toString("base64") } }) +
            line({ exit: { exit_code: 1 } });
        const pieces = [all.slice(0, 7), all.slice(7, 40), all.slice(40, 41), all.slice(41)];
        execReply(Readable.from(pieces.map((p) => Buffer.from(p))));
        const result = await sb.exec.run("x");
        expect(result.stdout).toBe("héllo");
        expect(result.exitCode).toBe(1);
    });

    it("a stream error envelope is raised", async () => {
        const sb = await sandbox();
        execReply(line({ stdout: b64("a") }) + JSON.stringify({ error: { http_code: 500, message: "gateway failed" } }) + "\n");
        const err = await sb.exec.run("x").catch((e) => e);
        expect(err).toBeInstanceOf(SandboxError);
        expect(err.message).toBe("gateway failed");
        expect(err.status).toBe(500);
    });

    it("a stream that ends before the exit event is an error, not a guess", async () => {
        const sb = await sandbox();
        execReply(line({ stdout: b64("partial") }));
        await expect(sb.exec.run("x")).rejects.toThrow(/exec stream ended before the process exited; its outcome is unknown/);
    });

    it("a 400 before the stream is an InvalidRequestError", async () => {
        const sb = await sandbox();
        api()
            .post(EXEC)
            .reply(
                400,
                { id: "bad_request", message: "this sandbox's template image does not support interactive stdin or PTY exec; create a new sandbox", request_id: "r" },
                JSON_TYPE,
            );
        const err = await sb.exec.start(undefined, { pty: true }).catch((e) => e);
        expect(err).toBeInstanceOf(InvalidRequestError);
        expect(err.status).toBe(400);
        expect(err.requestId).toBe("r");
        expect(err.message).toMatch(/does not support interactive stdin/);
    });

    it("an HTML reply is a typed error with the status", async () => {
        const sb = await sandbox();
        api().post(EXEC).reply(502, "<html><body>Bad Gateway</body></html>", { "Content-Type": "text/html" });
        const err = await sb.exec.run("x").catch((e) => e);
        expect(err).toBeInstanceOf(ServiceError);
        expect(err.status).toBe(502);
    });

    it("a 200 that is not JSON is not read as a stream", async () => {
        const sb = await sandbox();
        api().post(EXEC).reply(200, "<html>hi</html>", { "Content-Type": "text/html" });
        await expect(sb.exec.run("x")).rejects.toThrow(/unexpected text\/html response \(HTTP 200\)/);
    });

    it("start keeps stdin open, reads started, and tracks the stdin offset", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        const stream = new Readable({ read() {} });
        execReply(stream, seen);
        stream.push(line({ started: { exec_id: "ex-1" } }));
        const session = await sb.exec.start(["cat"]);
        expect(seen.body).toEqual({ argv: ["cat"], keep_stdin_open: true });
        expect(session.execId).toBe("ex-1");

        const stdin = `/v2/sandboxes/${ID}/exec/ex-1/stdin`;
        api().post(stdin, { data: b64("hi\n"), offset: "0" }).reply(200, { offset: "3" });
        api().post(stdin, { data: b64("more"), offset: "3" }).reply(200, { offset: "7" });
        api().post(stdin, { offset: "7", eof: true }).reply(200, { offset: "7" });
        // Sent concurrently, the writes still go one at a time with consistent offsets.
        await Promise.all([session.writeStdin("hi\n"), session.writeStdin(new TextEncoder().encode("more"))]);
        await session.closeStdin();
        expect(nock.isDone()).toBe(true);

        stream.push(line({ stdout: b64("hi\nmore") }));
        stream.push(line({ exit: { duration_ms: "3892" } }));
        stream.push(null);
        // Let nock deliver the end of the body before the loop stops reading at the exit event.
        await new Promise((resolve) => setTimeout(resolve, 20));
        const types: string[] = [];
        let stdout = "";
        for await (const e of session) {
            types.push(e.type);
            if (e.type === "stdout") stdout += e.text;
        }
        expect(types).toEqual(["started", "stdout", "exit"]);
        expect(stdout).toBe("hi\nmore");
    });

    it("writeStdin with eof sends data and eof together", async () => {
        const sb = await sandbox();
        const stream = new Readable({ read() {} });
        execReply(stream);
        stream.push(line({ started: { exec_id: "ex-2" } }));
        const session = await sb.exec.start("cat");
        api().post(`/v2/sandboxes/${ID}/exec/ex-2/stdin`, { data: b64("x"), offset: "0", eof: true }).reply(200, { offset: "1" });
        await session.writeStdin("x", { eof: true });
        expect(nock.isDone()).toBe(true);
        stream.push(line({ exit: {} }));
        stream.push(null);
        // Let nock deliver the end of the body before wait() stops reading at the exit event.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(await session.wait()).toMatchObject({ exitCode: 0 });
    });

    it("a PTY start sends the pty block, allows no command, and resizes", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(line({ started: { exec_id: "ex-3" } }) + line({ stdout: b64("$ ") }) + line({ exit: {} }), seen);
        const session = await sb.exec.start(undefined, { pty: { rows: 24, cols: 80, term: "xterm-256color" } });
        expect(seen.body).toEqual({ keep_stdin_open: true, pty: { rows: 24, cols: 80, term: "xterm-256color" } });

        api().post(`/v2/sandboxes/${ID}/exec/ex-3/resize`, { rows: 40, cols: 120 }).reply(200, {});
        await session.resize(40, 120);
        expect(nock.isDone()).toBe(true);
        await expect(session.resize(0, 80)).rejects.toThrow(/rows/);
        await expect(session.resize(24, 1001)).rejects.toThrow(/cols/);
        await expect(session.resize(24.5, 80)).rejects.toThrow(/rows/);
        expect((await session.wait()).stdout).toBe("$ ");
    });

    it("pty: true sends an empty pty block", async () => {
        const sb = await sandbox();
        const seen: { body?: unknown } = {};
        execReply(line({ started: { exec_id: "ex-4" } }) + line({ exit: {} }), seen);
        await sb.exec.start("bash", { pty: true, keepStdinOpen: false });
        expect(seen.body).toEqual({ argv: ["bash", "-lc", "bash"], pty: {} });
    });

    it("a plain start has no exec id, so stdin and resize are refused", async () => {
        const sb = await sandbox();
        execReply(line({ stdout: b64("a") }) + line({ exit: {} }));
        const session = await sb.exec.start(["echo", "a"], { keepStdinOpen: false });
        expect(session.execId).toBeUndefined();
        await expect(session.writeStdin("x")).rejects.toThrow(/no exec id/);
        await expect(session.resize(10, 10)).rejects.toThrow(/no exec id/);
        expect((await session.wait()).stdout).toBe("a");
        await expect(session.wait()).rejects.toThrow(/only be read once/);
    });

    it("validates before sending", async () => {
        const sb = await sandbox();
        await expect(sb.exec.run("")).rejects.toThrow(/required/);
        await expect(sb.exec.run([])).rejects.toThrow(/required/);
        await expect(sb.exec.start()).rejects.toThrow(/required/);
        await expect(sb.exec.run(["", "x"])).rejects.toThrow(/argv\[0\]/);
        await expect(sb.exec.run("x", { envVars: { "": "1" } })).rejects.toThrow(/environment variable/);
        await expect(sb.exec.run("x", { timeoutSeconds: -1 })).rejects.toThrow(/timeoutSeconds/);
        await expect(sb.exec.start(undefined, { pty: { rows: 0 } })).rejects.toThrow(/pty.rows/);
        await expect(sb.exec.run("x", { bogus: 1 } as never)).rejects.toThrow(/unsupported option bogus/);
        await expect(sb.exec.start("x", { pty: { width: 1 } as never })).rejects.toThrow(/unsupported option width/);
        expect(nock.isDone()).toBe(true);
    });

    it("close disconnects without an error", async () => {
        const sb = await sandbox();
        const stream = new Readable({ read() {} });
        execReply(stream);
        stream.push(line({ started: { exec_id: "ex-5" } }));
        const session = await sb.exec.start(["sleep", "60"]);
        const types: string[] = [];
        const done = (async () => {
            for await (const e of session.events()) types.push(e.type);
        })();
        await new Promise((r) => setTimeout(r, 20));
        session.close();
        await done;
        expect(types).toEqual(["started"]);
    });
});
