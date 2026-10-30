import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createPubmedClient } from "./pubmed.js";

// Load backend settings from the same file, no matter where we start the server.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

// Give the app a PubMed client that keeps the API key on the server.
const app = createApp({
  searchPubmed: createPubmedClient({
    baseUrl: process.env.PUBMED_BASE_URL || undefined,
    apiKey: process.env.PUBMED_API_KEY || "",
  }),
});

const port = process.env.PORT || 3001;

// Print the local address once the server is ready to accept requests.
app.listen(port, () => console.log("Server running at http://localhost:" + port));
