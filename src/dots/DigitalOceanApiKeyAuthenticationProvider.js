import { UserAgentHandlerOptions, UserAgentHandlerOptionsKey } from "@microsoft/kiota-http-fetchlibrary";
import pkg from '../../package.json' with { type: "json" };
import { userAgentToken } from "./agents/detect.js";
/** Authenticate a request by using an API Key */
export class DigitalOceanApiKeyAuthenticationProvider {
    /**
     * @constructor Creates an instance of ApiKeyAuthenticationProvider
     * @param apiKey The API Key to use for authentication
     */
    constructor(apiKey) {
        this.apiKey = apiKey;
        if (!apiKey) {
            throw new Error("apiKey cannot be null or empty");
        }
    }
    authenticateRequest(request, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    additionalAuthenticationContext) {
        request.headers.add("Authorization", `Bearer ${this.apiKey}`);
        const agentToken = userAgentToken();
        if (!agentToken) {
            request.headers.add("User-Agent", `DigitalOcean-Dots/${pkg.version}`);
            return Promise.resolve();
        }
        // kiota's UserAgentHandler appends its own product token after this
        // provider runs, so the agent token rides on that one to stay last.
        const options = request.getRequestOptions()[UserAgentHandlerOptionsKey]
            ?? new UserAgentHandlerOptions();
        if (!options.enable) {
            request.headers.add("User-Agent", `DigitalOcean-Dots/${pkg.version} ${agentToken}`);
            return Promise.resolve();
        }
        request.headers.add("User-Agent", `DigitalOcean-Dots/${pkg.version}`);
        if (!options.productVersion.endsWith(` ${agentToken}`)) {
            request.addRequestOptions([new UserAgentHandlerOptions({
                    enable: true,
                    productName: options.productName,
                    productVersion: `${options.productVersion} ${agentToken}`,
                })]);
        }
        return Promise.resolve();
    }
}
