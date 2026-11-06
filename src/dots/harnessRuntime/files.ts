/**
 * File transfer for a session's `/workspace` folder.
 *
 * Two server paths carry files. The direct path streams through the API and
 * stops at 50 MiB; every download carries a checksum footer. Staged transfers
 * go through object storage with presigned URLs, up to 50 GiB, and report the
 * file's SHA-256 when they finish. `upload` picks the path by size;
 * `download` uses the direct path unless asked for a stream.
 */

import {
    TransfersPostRequestBody_directionObject,
    type TransfersPostRequestBody,
} from "../v2/agents/sessions/item/workspace/transfers/index.js";
import { call, HarnessRuntimeError, required, TimeoutError } from "./errors.js";
import type { RuntimeContext } from "./session.js";

/** The most the direct path carries; larger uploads are staged. */
const DIRECT_MAX_BYTES = 50 * 1024 * 1024;
/** Parts uploaded at once in a staged upload. */
const PART_CONCURRENCY = 4;
/** How long a staged transfer may take to finish on the server, by default. */
const STAGED_TIMEOUT_MS = 60 * 60_000;

/** Fixed footer the server appends to a direct download: "DOWSSHA1" + 64 hex + "\n". */
const FOOTER_BYTES = 73;
const FOOTER = /^DOWSSHA1([0-9a-f]{64})\n$/;

/** Anything `upload` can send. Streams and iterables are read one part at a time. */
export type UploadData =
    | string
    | Uint8Array
    | ArrayBuffer
    | Blob
    | ReadableStream<Uint8Array>
    | AsyncIterable<Uint8Array>;

type StagedSource = Uint8Array | Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

/** Options for transfers. */
export interface FileOptions {
    /** Upload: the data is a tar to extract at `path`. Download: return `path` as a tar. */
    archive?: boolean;
    /** How long a staged transfer may take to finish on the server. Defaults to 60 minutes. */
    timeoutMs?: number;
}

/**
 * File transfer for a session's `/workspace` folder. When the session has a
 * persistent workspace attached, that folder is the workspace, so files written
 * here outlive the session.
 */
export class SessionFiles {
    constructor(
        private readonly ctx: RuntimeContext,
        private readonly sessionId: string,
    ) {}

    private get item() {
        return this.ctx.client.v2.agents.sessions.bySession_id(this.sessionId).workspace;
    }

    /**
     * Writes `data` to `path` (relative to `/workspace`). Up to 50 MiB goes
     * straight through the API; anything larger, and any stream, is staged
     * through object storage, up to 50 GiB.
     */
    async upload(path: string, data: UploadData, options: FileOptions = {}): Promise<void> {
        let input: StagedSource =
            typeof data === "string"
                ? new TextEncoder().encode(data)
                : data instanceof ArrayBuffer
                  ? new Uint8Array(data)
                  : data;
        if (input instanceof Blob && input.size <= DIRECT_MAX_BYTES) input = new Uint8Array(await input.arrayBuffer());
        if (input instanceof Uint8Array && input.length <= DIRECT_MAX_BYTES) {
            const body = toArrayBuffer(input);
            await call(() => this.item.upload.post(body, { queryParameters: { path, isArchive: options.archive } }));
            return;
        }
        // A stream's size is unknown, so even a small one is staged.
        await this.stagedUpload(path, input, options);
    }

    /**
     * Reads `path` (relative to `/workspace`), up to 50 MiB. The bytes are
     * checked against the checksum the server sends with them.
     */
    download(path: string, options?: FileOptions & { format?: "bytes" }): Promise<Uint8Array>;
    /**
     * Reads `path` as a stream, at any size up to 50 GiB, through a staged
     * transfer. The stream is not checked against a checksum; `copyToLocal`
     * checks it.
     */
    download(path: string, options: FileOptions & { format: "stream" }): Promise<ReadableStream<Uint8Array>>;
    async download(
        path: string,
        options: FileOptions & { format?: "bytes" | "stream" } = {},
    ): Promise<Uint8Array | ReadableStream<Uint8Array>> {
        if (options.format === "stream") return (await this.stagedDownload(path, options)).body;
        const res = await call(() =>
            this.item.download.get({ queryParameters: { path, asArchive: options.archive } }),
        );
        return verifyDownload(new Uint8Array(required(res, "the download body")));
    }

    /** Reads `path` as UTF-8 text, up to 50 MiB. */
    async downloadText(path: string): Promise<string> {
        return new TextDecoder().decode(await this.download(path));
    }

    /** Node only. Uploads a local file to `remotePath`, at any size up to 50 GiB. */
    async copyFromLocal(localPath: string, remotePath: string, options: FileOptions = {}): Promise<void> {
        const { openAsBlob } = await import("node:fs");
        await this.upload(remotePath, await openAsBlob(localPath), options);
    }

    /**
     * Node only. Downloads `remotePath` to a local file, at any size up to
     * 50 GiB, and checks it against the SHA-256 the server reports, when it
     * reports one. A file that does not match is deleted and an error is raised.
     */
    async copyToLocal(remotePath: string, localPath: string, options: FileOptions = {}): Promise<void> {
        const [{ createWriteStream }, { rm }, { createHash }, { Readable, Transform }, { pipeline }] =
            await Promise.all([
                import("node:fs"),
                import("node:fs/promises"),
                import("node:crypto"),
                import("node:stream"),
                import("node:stream/promises"),
            ]);
        const { body, sha256 } = await this.stagedDownload(remotePath, options);
        const hash = createHash("sha256");
        const hashing = new Transform({
            transform(chunk: Buffer, _encoding, done) {
                hash.update(chunk);
                done(null, chunk);
            },
        });
        await pipeline(Readable.fromWeb(body as never), hashing, createWriteStream(localPath));
        if (sha256 && hash.digest("hex") !== sha256) {
            await rm(localPath, { force: true });
            throw new HarnessRuntimeError(`the download of ${remotePath} is corrupted: its checksum does not match`, 0);
        }
    }

    private get transfers() {
        return this.item.transfers;
    }

    private async stagedUpload(path: string, data: StagedSource, options: FileOptions) {
        const size = data instanceof Blob ? data.size : data instanceof Uint8Array ? data.length : undefined;
        const created = await call(() =>
            this.transfers.post({
                direction: TransfersPostRequestBody_directionObject.Upload,
                path,
                isArchive: options.archive,
                sizeBytes: size,
            } satisfies TransfersPostRequestBody),
        );
        const id = required(created?.transferId, "the transfer id");
        const partSize = required(created?.partSize, "the part size");
        try {
            const parts = partsOf(data, partSize);
            let failed = false;
            const worker = async () => {
                try {
                    for (let next = await parts.next(); !failed && !next.done; next = await parts.next()) {
                        await this.putPart(id, next.value.number, next.value.body);
                    }
                } catch (err) {
                    failed = true; // the other workers stop taking parts
                    throw err;
                }
            };
            await Promise.all(Array.from({ length: PART_CONCURRENCY }, worker));
            await call(() => this.transfers.byTransfer_id(id).commit.post({}));
            await this.waitForTransfer(id, options);
        } catch (err) {
            await this.transfers
                .byTransfer_id(id)
                .cancel.post({ reason: "the upload failed on the client" })
                .catch(() => undefined);
            throw err;
        }
    }

    /**
     * PUTs one part to object storage. Each attempt asks for a fresh presigned
     * URL, so an expired URL is replaced. Network errors, 403 (expired) and 5xx
     * are retried; anything else is final.
     */
    private async putPart(id: string, number: number, body: Blob | Uint8Array): Promise<void> {
        const doFetch = this.ctx.transport.fetchImpl ?? fetch;
        for (let attempt = 0; ; attempt++) {
            const urls = await call(() =>
                this.transfers.byTransfer_id(id).partUploadUrls.post({ partNumbers: [number] }),
            );
            const url = required(urls?.partUrls?.[0]?.uploadUrl, "the part upload URL");
            let status = 0;
            try {
                const res = await doFetch(url, { method: "PUT", body: body as RequestInit["body"] });
                if (res.ok) return;
                status = res.status;
            } catch {
                // A network error: retry below.
            }
            const retryable = status === 0 || status === 403 || status >= 500;
            if (!retryable || attempt >= 3) {
                throw new HarnessRuntimeError(`uploading part ${number} failed (HTTP ${status || "network error"})`, status);
            }
            await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
    }

    private async stagedDownload(path: string, options: FileOptions) {
        const created = await call(() =>
            this.transfers.post({
                direction: TransfersPostRequestBody_directionObject.Download,
                path,
                asArchive: options.archive,
            } satisfies TransfersPostRequestBody),
        );
        const id = required(created?.transferId, "the transfer id");
        const done = await this.waitForTransfer(id, options);
        const url = required(done.downloadUrl, "the download URL");
        const res = await (this.ctx.transport.fetchImpl ?? fetch)(url);
        if (!res.ok || !res.body) {
            throw new HarnessRuntimeError(`fetching the staged download failed (HTTP ${res.status})`, res.status);
        }
        return { body: res.body as ReadableStream<Uint8Array>, sha256: done.sha256 ?? undefined };
    }

    private async waitForTransfer(id: string, options: FileOptions) {
        const deadline = Date.now() + (options.timeoutMs ?? STAGED_TIMEOUT_MS);
        for (;;) {
            const status = required(
                await call(() => this.transfers.byTransfer_id(id).get()),
                "the transfer status",
            );
            if (status.status === "completed") return status;
            if (status.status === "failed") {
                throw new HarnessRuntimeError(`transfer ${id} failed: ${status.errorMessage ?? "no reason given"}`, 0);
            }
            if (Date.now() >= deadline) throw new TimeoutError(`transfer ${id} did not finish in time`);
            await new Promise((resolve) => setTimeout(resolve, this.ctx.pollIntervalMs));
        }
    }
}

/**
 * Splits `data` into numbered parts of `partSize` bytes (the last may be
 * smaller). A Blob is sliced without reading it; a stream is read one part at
 * a time. Safe to pull from several workers: an async generator queues calls.
 */
async function* partsOf(
    data: StagedSource,
    partSize: number,
): AsyncGenerator<{ number: number; body: Blob | Uint8Array }> {
    if (data instanceof Blob || data instanceof Uint8Array) {
        const size = data instanceof Blob ? data.size : data.length;
        for (let at = 0, n = 1; at < size || n === 1; at += partSize, n++) {
            const end = Math.min(at + partSize, size);
            yield { number: n, body: data instanceof Blob ? data.slice(at, end) : data.subarray(at, end) };
        }
        return;
    }
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let n = 1;
    const take = (): Uint8Array => {
        const joined = new Uint8Array(pendingBytes);
        let at = 0;
        for (const chunk of pending) {
            joined.set(chunk, at);
            at += chunk.length;
        }
        pending = [];
        pendingBytes = 0;
        return joined;
    };
    for await (const chunk of iterate(data)) {
        let rest = chunk;
        while (pendingBytes + rest.length >= partSize) {
            const head = rest.subarray(0, partSize - pendingBytes);
            pending.push(head);
            pendingBytes += head.length;
            yield { number: n++, body: take() };
            rest = rest.subarray(head.length);
        }
        if (rest.length) {
            pending.push(rest);
            pendingBytes += rest.length;
        }
    }
    if (pendingBytes || n === 1) yield { number: n, body: take() };
}

async function* iterate(data: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
    if (Symbol.asyncIterator in data) {
        for await (const chunk of data as AsyncIterable<Uint8Array>) yield chunk;
        return;
    }
    const reader = (data as ReadableStream<Uint8Array>).getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
        }
    } finally {
        reader.releaseLock();
    }
}

/** Strips and checks the direct-download footer. Exported for tests. */
export async function verifyDownload(body: Uint8Array): Promise<Uint8Array> {
    if (body.length < FOOTER_BYTES) {
        throw new HarnessRuntimeError("the download is truncated: its checksum footer is missing", 0);
    }
    const payload = body.subarray(0, body.length - FOOTER_BYTES);
    const footer = new TextDecoder().decode(body.subarray(body.length - FOOTER_BYTES));
    const match = FOOTER.exec(footer);
    if (!match) {
        throw new HarnessRuntimeError("the download is truncated: its checksum footer is missing", 0);
    }
    const digest = await globalThis.crypto.subtle.digest("SHA-256", toArrayBuffer(payload));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== match[1]) {
        throw new HarnessRuntimeError("the download is corrupted: its checksum does not match", 0);
    }
    return payload;
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
