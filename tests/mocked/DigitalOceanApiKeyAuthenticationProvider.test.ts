import { DigitalOceanApiKeyAuthenticationProvider } from "../../src/dots/DigitalOceanApiKeyAuthenticationProvider.js";
import { RequestInformation } from "@microsoft/kiota-abstractions";

describe("DigitalOceanApiKeyAuthenticationProvider", () => {
    it("should add the User-Agent header to every request", async () => {
        const provider = new DigitalOceanApiKeyAuthenticationProvider("dummy-token");
        const request = new RequestInformation();
        await provider.authenticateRequest(request);
        expect(request.headers.get("User-Agent")).toContain("DigitalOcean-Dots/1.0");
    });
});
