import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildGraph } from "../../shared/graph.mjs";
import { createCache } from "./cache.js";

// Set up the API routes and serve the built frontend from the same server.
export function createApp({ searchPubmed, remember = createCache() }) {
  const app = express();

  // A quick way to check whether the backend is running.
  app.get("/api/health", (req, res) => res.json({ message: "Backend is running!" }));

  // Check the search inputs, then return saved results or fetch new ones.
  app.get("/api/search", async (req, res) => {
    const topic = typeof req.query.topic === "string" ? req.query.topic.trim() : "";
    const startYear = req.query.startYear ? Number(req.query.startYear) : null;
    const endYear = req.query.endYear ? Number(req.query.endYear) : null;
    const maxPapers = Number(req.query.maxPapers || 100);

    // Blank years are fine; entered years must be whole numbers in this range.
    const invalidYear = (year) => year !== null &&
      (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear());

    if (!topic || topic.length > 500) {
      return res.status(400).json({ error: "Enter a topic or paper title (up to 500 characters)." });
    }

    if (invalidYear(startYear) || invalidYear(endYear) ||
        (startYear !== null && endYear !== null && startYear > endYear)) {
      return res.status(400).json({ error: "Enter a valid year range." });
    }

    if (!Number.isInteger(maxPapers) || maxPapers < 1 || maxPapers > 100) {
      return res.status(400).json({ error: "Maximum papers must be between 1 and 100." });
    }

    const inputs = { topic, startYear, endYear, maxPapers };

    // Keep the query as entered so advanced PubMed searches still work.
    try {
      // This runs only when the same search is not already saved or in progress.
      const { value, cached } = await remember(JSON.stringify(inputs), async () => {
        const result = await searchPubmed(inputs);
        return { ...result, ...buildGraph(result.papers), appliedMaxPapers: maxPapers };
      });

      res.json({ ...value, cached });
    } catch {
      // Keep the error simple and avoid exposing a URL that contains the API key.
      res.status(502).json({ error: "Could not fetch papers from PubMed. Please try again shortly." });
    }
  });

  // Give unknown API routes a JSON error instead of the frontend page.
  app.use("/api", (req, res) => res.status(404).json({ error: "API route not found." }));

  const dist = fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  app.use(express.static(dist));

  // Open the React app for browser routes once a production build exists.
  app.get("/{*path}", (req, res) => {
    const index = `${dist}/index.html`;
    if (existsSync(index)) return res.sendFile(index);
    res.status(404).json({ error: "Build the frontend first, or use the Vite development server." });
  });

  return app;
}
