import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";
import {
  createDigitalOceanClient,
  DigitalOceanApiKeyAuthenticationProvider,
} from "../index.js";
import dotenv from "dotenv";

dotenv.config();

const token = process.env.DIGITALOCEAN_TOKEN;
if (!token) throw new Error("DIGITALOCEAN_TOKEN is required");

const adapter = new FetchRequestAdapter(
  new DigitalOceanApiKeyAuthenticationProvider(token)
);
const client = createDigitalOceanClient(adapter);

const main = async () => {
  const resp = await client.v2.regions.get();
  console.log("regions:", resp?.regions?.length ?? 0);
  console.log(resp?.regions?.slice(0, 5).map(r => `${r.slug}:${r.name}`));
};

main().catch(console.error);