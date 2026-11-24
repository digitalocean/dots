import { HttpMethod, RequestInformation } from "@microsoft/kiota-abstractions";
import { FetchRequestAdapter, HttpClient, UserAgentHandlerOptions } from "@microsoft/kiota-http-fetchlibrary";
import pkg from "../../package.json" with { type: "json" };
import agentsJSON from "../../src/dots/agents/agents.json" with { type: "json" };
import testcases from "../../src/dots/agents/testcases.json" with { type: "json" };
import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { type Condition, type Rules, detect, detectWith, matches, parse } from "../../src/dots/agents/detect.js";

// testcases.json is shared with godo and pydo, so every client reports the
// same agent for the same environment.
const rules = parse(agentsJSON as Rules);
const supportedTypes = ["anyOf", "allOf", "env_set", "env_value"];

describe("agents", () => {
    it("has valid embedded rules", () => {
        expect(rules.aiAgentVar).toBe("AI_AGENT");
        expect(rules.agents.length).toBeGreaterThan(0);

        const names = rules.agents.map((agent) => agent.name);
        expect(new Set(names).size).toBe(names.length);

        const check = (condition: Condition): void => {
            expect(supportedTypes).toContain(condition.type);
            (condition.conditions ?? []).forEach(check);
        };
        for (const agent of rules.agents) {
            expect(["anyOf", "allOf"]).toContain(agent.match.type);
            check(agent.match);
        }
    });

    it.each(testcases.map((tc) => [tc.name, tc] as const))("%s", (_name, tc) => {
        expect(detectWith(rules, tc.env as Record<string, string>)).toBe(tc.expected ?? undefined);
    });

    it("combines conditions", () => {
        const env = { A: "1", B: "x" };
        const set = (name: string): Condition => ({ type: "env_set", name });

        expect(matches({ type: "allOf", conditions: [set("A"), { type: "env_value", name: "B", value: "x" }] }, env)).toBe(true);
        expect(matches({ type: "allOf", conditions: [set("A"), set("C")] }, env)).toBe(false);
        expect(matches({ type: "anyOf", conditions: [set("C"), set("A")] }, env)).toBe(true);
        expect(matches({ type: "anyOf" }, env)).toBe(false);
        expect(matches({ type: "file_exists", name: "/" }, env)).toBe(false);
        expect(matches({ type: "env_value", name: "C" }, env)).toBe(false);
    });

    it.each([
        ["missing version", { namePattern: ".*" }],
        ["unsupported version", { version: 2, namePattern: ".*" }],
        ["invalid namePattern", { version: 1, namePattern: "(" }],
    ])("rejects %s", (_name, data) => {
        expect(() => parse(data as unknown as Rules)).toThrow();
    });

    it("reads the environment on each call", () => {
        expect(detect({ AI_AGENT: "first-agent" })).toBe("first-agent");
        expect(detect({ AI_AGENT: "second-agent" })).toBe("second-agent");
    });

    describe("User-Agent header", () => {
        let previous: string | undefined;
        beforeEach(() => {
            previous = process.env.AI_AGENT;
            process.env.AI_AGENT = "test-agent";
        });
        afterEach(() => {
            if (previous === undefined) {
                delete process.env.AI_AGENT;
            } else {
                process.env.AI_AGENT = previous;
            }
        });

        it("appends the agent after kiota's token", async () => {
            let sent: string | null = null;
            const fakeFetch = async (_url: string, init: RequestInit): Promise<Response> => {
                sent = new Headers(init.headers).get("User-Agent");
                return new Response(null, { status: 204 });
            };
            const adapter = new FetchRequestAdapter(
                new DigitalOceanApiKeyAuthenticationProvider("dummy-token"),
                undefined,
                undefined,
                new HttpClient(fakeFetch),
            );
            const request = new RequestInformation(HttpMethod.GET, "https://api.digitalocean.com/v2/account");
            await adapter.sendNoResponseContent(request, undefined);

            const kiota = new UserAgentHandlerOptions();
            expect(sent).toBe(`DigitalOcean-Dots/${pkg.version}, ${kiota.productName}/${kiota.productVersion} Agent/test-agent`);
        });

        it("appends the agent to the dots token when kiota's token is disabled", async () => {
            const request = new RequestInformation();
            request.addRequestOptions([new UserAgentHandlerOptions({ enable: false })]);
            await new DigitalOceanApiKeyAuthenticationProvider("dummy-token").authenticateRequest(request);
            expect(request.headers.get("User-Agent")).toEqual(new Set([`DigitalOcean-Dots/${pkg.version} Agent/test-agent`]));
        });
    });
});
