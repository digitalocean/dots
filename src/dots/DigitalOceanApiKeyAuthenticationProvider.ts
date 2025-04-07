import { AuthenticationProvider, RequestInformation } from "@microsoft/kiota-abstractions";

/** Authenticate a request by using an API Key */
export class DigitalOceanApiKeyAuthenticationProvider implements AuthenticationProvider {
    /**
     * @constructor Creates an instance of ApiKeyAuthenticationProvider
     * @param apiKey The API Key to use for authentication
     */
    public constructor(
        private readonly apiKey: string,
    ) {
        if (!apiKey) {
            throw new Error("apiKey cannot be null or empty");
        }
    }
    public authenticateRequest(
        request: RequestInformation,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        additionalAuthenticationContext?: Record<string, unknown> | undefined
    ): Promise<void> {
        request.headers.add("Authorization", `Bearer ${this.apiKey}`);
        return Promise.resolve();
    }
}