/**
 * Files in a sandbox: `/v2/sandboxes/{id}/files`.
 *
 * The JSON calls (list, info, exists, make-directory, move, remove) go through
 * the generated client. Upload and download carry raw bytes, which the
 * generated client's JSON guard would reject, so those two reuse the streaming
 * helpers (`prepareRequest`, `openStream`) and send the same authenticated
 * request.
 *
 * Every upload sends the SHA-256 of its body in `X-Content-Sha256`, which the
 * sandbox checks after the write. Every download ends in a 73-byte integrity
 * footer, which is checked against the payload and stripped. A transfer that
 * answers `503` (too many concurrent transfers) is retried with backoff.
 *
 * ```ts
 * await sandbox.files.write("/workspace/hello.txt", "Hello\n");
 * const text = await sandbox.files.readText("/workspace/hello.txt");
 * for (const entry of await sandbox.files.list("/workspace")) console.log(entry.type, entry.path, entry.size);
 * await sandbox.files.remove("/workspace/hello.txt");
 * ```
 */

import {
    File_entry_typeObject,
    type File_entry as FileEntryModel,
} from "../models/index.js";
import { HarnessStreamError, HttpMethod, openStream, prepareRequest } from "../streaming/harnessStream.js";
import { DownloadRequestBuilderUriTemplate } from "../v2/sandboxes/item/files/download/index.js";
import { UploadRequestBuilderUriTemplate } from "../v2/sandboxes/item/files/upload/index.js";
import { rejectUnknownOptions, type Connection } from "./config.js";
import { call, required, SandboxError, toSandboxError } from "./errors.js";

/** What a file system entry is. */
export type FileEntryType = "file" | "directory" | "symlink" | "unspecified";

/** A file, directory or symlink in a sandbox. */
export interface FileEntry {
    /** The base name. */
    name: string;
    type: FileEntryType;
    /** The absolute path in the sandbox. */
    path: string;
    /** The size in bytes. */
    size: number;
    /** The Unix mode bits, such as `420` (`0644`). */
    mode: number;
    /** The permissions in `ls` form, such as `-rw-r--r--`. */
    permissions?: string;
    owner?: string;
    group?: string;
    modifiedTime?: Date;
    /** Where a symlink points. Set only for symlinks. */
    symlinkTarget?: string;
}

/** The content {@link Files.write} accepts. A string is written as UTF-8. */
export type FileData = string | Uint8Array | ArrayBuffer | Blob;

/** Options for uploads and downloads. */
export interface FileTransferOptions {
    /** Aborts the transfer. */
    signal?: AbortSignal;
}

/** Options for {@link Files.list}. */
export interface FileListOptions {
    /** How many levels to list. `1`, the default, lists the directory's own entries; `2` adds its subdirectories' entries, and so on. */
    depth?: number;
}

/** The outcome of {@link Files.write} and {@link Files.writeArchive}. */
export interface FileWriteResult {
    /** The absolute path written to. */
    path: string;
    bytesWritten: number;
}

/** The outcome of {@link Files.makeDir}. */
export interface MakeDirResult {
    /** False when the directory already existed. */
    created: boolean;
    entry: FileEntry;
}

/** The magic bytes that open a download's integrity footer. */
export const FOOTER_MAGIC = "DOWSSHA1";
/** A download's integrity footer: the magic, 64 hex digits of SHA-256, and a newline. */
export const FOOTER_LENGTH = 73;

/**
 * Backoff before each retry of a transfer that answered `503`. A `Retry-After`
 * header wins over the delay. Mutable for tests.
 * @internal
 */
export const transferRetry = { delaysMs: [500, 1_000, 2_000] };

const TRANSFER_KEYS = ["signal"];
const LIST_KEYS = ["depth"];

const TYPES: Record<string, FileEntryType> = {
    [File_entry_typeObject.FILE_ENTRY_TYPE_FILE]: "file",
    [File_entry_typeObject.FILE_ENTRY_TYPE_DIRECTORY]: "directory",
    [File_entry_typeObject.FILE_ENTRY_TYPE_SYMLINK]: "symlink",
};

/** Converts the API's entry. Fields equal to zero or empty are omitted by the API, so they default here. */
export function toFileEntry(m: FileEntryModel | null | undefined): FileEntry {
    if (!m) throw new SandboxError("the API response did not include the file entry");
    return {
        name: m.name ?? "",
        type: (m.type && TYPES[m.type]) || "unspecified",
        path: m.path ?? "",
        size: toNumber(m.size),
        mode: m.mode ?? 0,
        permissions: m.permissions || undefined,
        owner: m.owner || undefined,
        group: m.group || undefined,
        modifiedTime: m.modifiedTime ?? undefined,
        symlinkTarget: m.symlinkTarget || undefined,
    };
}

function toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>));
    let hex = "";
    for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
    return hex;
}

/**
 * Checks a download's integrity footer and returns the payload without it.
 * Throws {@link SandboxError} when the footer is missing or malformed, or the
 * payload's SHA-256 does not match it.
 */
export async function stripFooter(body: Uint8Array): Promise<Uint8Array> {
    if (body.byteLength < FOOTER_LENGTH) {
        throw new SandboxError(
            `download is ${body.byteLength} bytes, shorter than its ${FOOTER_LENGTH}-byte integrity footer`,
        );
    }
    const split = body.byteLength - FOOTER_LENGTH;
    const footer = new TextDecoder("latin1").decode(body.subarray(split));
    if (!footer.startsWith(FOOTER_MAGIC) || footer[FOOTER_LENGTH - 1] !== "\n") {
        throw new SandboxError("download has no integrity footer: the transfer may be truncated");
    }
    const expected = footer.slice(FOOTER_MAGIC.length, FOOTER_LENGTH - 1);
    if (!/^[0-9a-f]{64}$/.test(expected)) {
        throw new SandboxError("download's integrity footer is malformed: the digest is not 64 lowercase hex digits");
    }
    const payload = body.subarray(0, split);
    const actual = await sha256Hex(payload);
    if (actual !== expected) {
        throw new SandboxError(`download failed its integrity check: SHA-256 ${actual}, footer says ${expected}`);
    }
    return payload;
}

async function toBytes(data: FileData, where: string): Promise<Uint8Array> {
    if (typeof data === "string") return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof Blob !== "undefined" && data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
    throw new SandboxError(`${where}: \`data\` must be a string, Uint8Array, ArrayBuffer or Blob`);
}

function requirePath(path: string, where: string, name = "path"): string {
    if (typeof path !== "string" || !path.trim()) throw new SandboxError(`${where}: \`${name}\` is required`);
    return path;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal!.reason);
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** Reads, writes and manages files in one sandbox. */
export class Files {
    /** @internal */
    constructor(
        private readonly conn: Connection,
        private readonly sandboxId: string,
    ) {}

    private get item() {
        return this.conn.client.v2.sandboxes.bySandbox_id(this.sandboxId).files;
    }

    /**
     * Writes `data` to `path`, replacing any file there, up to 50 MiB. A
     * string is written as UTF-8. The sandbox checks the body's SHA-256.
     */
    async write(path: string, data: FileData, opts: FileTransferOptions = {}): Promise<FileWriteResult> {
        rejectUnknownOptions(opts, TRANSFER_KEYS, "files.write");
        requirePath(path, "files.write");
        if (data === undefined || data === null) throw new SandboxError("files.write: `data` is required");
        return this.upload(path, await toBytes(data, "files.write"), false, opts.signal);
    }

    /** Uploads a tar archive and extracts it into the directory `dir`, up to 50 MiB. */
    async writeArchive(
        dir: string,
        tar: Uint8Array | ArrayBuffer | Blob,
        opts: FileTransferOptions = {},
    ): Promise<FileWriteResult> {
        rejectUnknownOptions(opts, TRANSFER_KEYS, "files.writeArchive");
        requirePath(dir, "files.writeArchive", "dir");
        if (tar === undefined || tar === null || typeof tar === "string") {
            throw new SandboxError("files.writeArchive: `tar` must be a Uint8Array, ArrayBuffer or Blob");
        }
        return this.upload(dir, await toBytes(tar, "files.writeArchive"), true, opts.signal);
    }

    /** Reads a file's bytes, up to 50 MiB. The integrity footer is checked and stripped. */
    async read(path: string, opts: FileTransferOptions = {}): Promise<Uint8Array> {
        rejectUnknownOptions(opts, TRANSFER_KEYS, "files.read");
        requirePath(path, "files.read");
        return this.download(path, false, opts.signal);
    }

    /** Reads a file as UTF-8 text. */
    async readText(path: string, opts: FileTransferOptions = {}): Promise<string> {
        rejectUnknownOptions(opts, TRANSFER_KEYS, "files.readText");
        requirePath(path, "files.readText");
        return new TextDecoder().decode(await this.download(path, false, opts.signal));
    }

    /** Reads a file or directory as a tar archive, up to 50 MiB. A directory can only be read this way. */
    async readArchive(path: string, opts: FileTransferOptions = {}): Promise<Uint8Array> {
        rejectUnknownOptions(opts, TRANSFER_KEYS, "files.readArchive");
        requirePath(path, "files.readArchive");
        return this.download(path, true, opts.signal);
    }

    /** Lists a directory. Symlinks are listed, not followed. */
    async list(path: string, opts: FileListOptions = {}): Promise<FileEntry[]> {
        rejectUnknownOptions(opts, LIST_KEYS, "files.list");
        requirePath(path, "files.list");
        if (opts.depth !== undefined && !(Number.isInteger(opts.depth) && opts.depth >= 0)) {
            throw new SandboxError("files.list: `depth` must be a non-negative integer");
        }
        const res = await call(() => this.item.list.get({ queryParameters: { path, depth: opts.depth } }));
        return (res?.entries ?? []).map(toFileEntry);
    }

    /** Reads the metadata of a file, directory or symlink. Throws `NotFoundError` when nothing is at `path`. */
    async getInfo(path: string): Promise<FileEntry> {
        requirePath(path, "files.getInfo");
        const res = await call(() => this.item.info.get({ queryParameters: { path } }));
        return toFileEntry(required(res, "the file entry").entry);
    }

    /** True when a file, directory or symlink is at `path`. */
    async exists(path: string): Promise<boolean> {
        requirePath(path, "files.exists");
        const res = await call(() => this.item.exists.get({ queryParameters: { path } }));
        return res?.exists === true;
    }

    /** Creates a directory and any missing parents. `created` is false when it already existed. */
    async makeDir(path: string): Promise<MakeDirResult> {
        requirePath(path, "files.makeDir");
        const res = await call(() => this.item.makeDirectory.post({ path }));
        return { created: res?.created === true, entry: toFileEntry(required(res, "the directory entry").entry) };
    }

    /**
     * Moves or renames a file, directory or symlink. Missing parents of the
     * destination are created, and a file at the destination is replaced.
     */
    async move(source: string, destination: string): Promise<FileEntry> {
        requirePath(source, "files.move", "source");
        requirePath(destination, "files.move", "destination");
        const res = await call(() => this.item.move.post({ source, destination }));
        return toFileEntry(required(res, "the moved entry").entry);
    }

    /** Removes a file, or a directory with everything in it. A missing path is not an error. */
    async remove(path: string): Promise<void> {
        requirePath(path, "files.remove");
        await call(() => this.item.remove.post({ path }));
    }

    private async upload(path: string, body: Uint8Array, isArchive: boolean, signal?: AbortSignal): Promise<FileWriteResult> {
        const digest = await sha256Hex(body);
        const response = await this.transfer(
            HttpMethod.POST,
            UploadRequestBuilderUriTemplate,
            { path, is_archive: isArchive || undefined },
            {
                Accept: "application/json",
                "Content-Type": "application/octet-stream",
                "X-Content-Sha256": digest,
            },
            body,
            signal,
        );
        const text = await response.text();
        let parsed: { path?: string; bytes_written?: string | number };
        try {
            parsed = text ? JSON.parse(text) : {};
        } catch {
            throw new SandboxError(`the upload response was not JSON: ${text.slice(0, 200)}`, response.status);
        }
        return { path: parsed.path || path, bytesWritten: toNumber(parsed.bytes_written) };
    }

    private async download(path: string, asArchive: boolean, signal?: AbortSignal): Promise<Uint8Array> {
        const response = await this.transfer(
            HttpMethod.GET,
            DownloadRequestBuilderUriTemplate,
            { path, as_archive: asArchive || undefined },
            { Accept: "application/octet-stream, application/json" },
            undefined,
            signal,
        );
        return stripFooter(new Uint8Array(await response.arrayBuffer()));
    }

    /** Sends one transfer, retrying a `503` with backoff, and maps a failure to a typed error. */
    private async transfer(
        method: HttpMethod,
        template: string,
        query: Record<string, string | boolean | undefined>,
        headers: Record<string, string>,
        body: Uint8Array | undefined,
        signal?: AbortSignal,
    ): Promise<Response> {
        const options = { ...this.conn.transport, signal };
        for (let attempt = 0; ; attempt++) {
            try {
                const request = await prepareRequest(method, template, { sandbox_id: this.sandboxId }, query, options, headers);
                return await openStream(
                    request,
                    { method, body: body as RequestInit["body"] },
                    options,
                );
            } catch (err) {
                const delays = transferRetry.delaysMs;
                if (err instanceof HarnessStreamError && err.status === 503 && attempt < delays.length && !signal?.aborted) {
                    const wait = err.retryAfter !== undefined ? err.retryAfter * 1_000 : delays[attempt];
                    await sleep(wait, signal);
                    continue;
                }
                throw toSandboxError(err);
            }
        }
    }
}
