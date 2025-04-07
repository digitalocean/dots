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
        return Promise.resolve();
    }
}
