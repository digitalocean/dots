import { SandboxError } from "./errors.js";

/** Reads a list one page at a time with `nextItems()`, or all of it with `for await`. */
export class Pages<T> implements AsyncIterable<T> {
    private token: string | undefined;
    private started = false;

    /** @internal */
    constructor(
        private readonly fetchPage: (token: string | undefined) => Promise<{ items: T[]; next?: string | null }>,
        nextToken?: string,
    ) {
        this.token = nextToken || undefined;
    }

    /** True until a page came back without a next-page token. */
    get hasNext(): boolean {
        return !this.started || this.token !== undefined;
    }

    /** The token that resumes after the last page read, if there is one. */
    get nextToken(): string | undefined {
        return this.token;
    }

    async nextItems(): Promise<T[]> {
        if (!this.hasNext) throw new SandboxError("no more items to list");
        const page = await this.fetchPage(this.token);
        this.started = true;
        this.token = page.next || undefined;
        return page.items;
    }

    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
        while (this.hasNext) yield* await this.nextItems();
    }
}
