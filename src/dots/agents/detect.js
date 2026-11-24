/**
 * Identifies the AI agent, if any, driving the current process.
 *
 * The rules live in agents.json, which is synced from digitalocean/openapi and
 * shared with the other DigitalOcean clients; see agents.schema.json for its
 * format. Do not edit the JSON files here; change them in digitalocean/openapi.
 */
import agentsJSON from "./agents.json" with { type: "json" };
/** The agents.json format this module can read. */
export const SUPPORTED_VERSION = 1;
/** Checks agents.json, rejecting formats this module can't read. */
export function parse(rules) {
    if (rules?.version !== SUPPORTED_VERSION) {
        throw new Error(`agents: unsupported agents.json version ${rules?.version}, want ${SUPPORTED_VERSION}`);
    }
    return { ...rules, nameRegExp: new RegExp(rules.namePattern) };
}
export function matches(condition, env) {
    switch (condition.type) {
        case "anyOf":
            return (condition.conditions ?? []).some((c) => matches(c, env));
        case "allOf":
            return (condition.conditions ?? []).every((c) => matches(c, env));
        case "env_set":
            return !!env[condition.name ?? ""];
        case "env_value": {
            const value = env[condition.name ?? ""];
            return value !== undefined && value === condition.value;
        }
        default:
            return false;
    }
}
/**
 * Returns the agent described by env, or undefined if none matches. A valid
 * value in the variable named by aiAgentVar wins over the rule list.
 */
export function detectWith(rules, env) {
    const override = env[rules.aiAgentVar]?.trim();
    if (override !== undefined && rules.nameRegExp.test(override)) {
        return override;
    }
    return rules.agents.find((agent) => matches(agent.match, env))?.name;
}
let loaded;
/**
 * Returns the name of the AI agent driving the process, or undefined. The
 * rules are parsed once; the environment is read on every call. Detection must
 * never break the client, so unreadable rules mean no agent.
 */
export function detect(env) {
    if (loaded === undefined) {
        try {
            loaded = parse(agentsJSON);
        }
        catch {
            loaded = null;
        }
    }
    if (loaded === null) {
        return undefined;
    }
    return detectWith(loaded, env ?? (typeof process === "undefined" ? {} : process.env));
}
/** Returns the "Agent/<name>" User-Agent token, or undefined if no agent. */
export function userAgentToken() {
    const name = detect();
    return name ? `Agent/${name}` : undefined;
}
