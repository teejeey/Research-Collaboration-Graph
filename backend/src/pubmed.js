import { normalizeAuthors } from "../../shared/graph.mjs";

// Pause between requests without blocking the rest of the server.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create one PubMed client so all searches share the same request queue.
export function createPubmedClient({
  baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/", apiKey = "",
  fetchImpl = fetch, sleep = wait, now = Date.now,
} = {}) {
  const base = baseUrl.replace(/\/+$/, "") + "/";
  const key = apiKey.trim();
  const interval = key ? 120 : 400;
  let lastRequest = -Infinity;
  let queue = Promise.resolve();

  // Wait our turn, call PubMed, and retry briefly if it is busy.
  function request(endpoint, params) {
    const task = queue.then(async () => {
      const url = new URL(endpoint, base);
      url.search = new URLSearchParams({ db: "pubmed", retmode: "json", ...params });
      if (key) url.searchParams.set("api_key", key);

      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(Math.max(0, lastRequest + interval - now()));
        lastRequest = now();
        const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
        const retryable = response.status === 429 || response.status >= 500;

        if (!response.ok) {
          if (!retryable || attempt === 2) throw new Error("PubMed request failed.");

          // Use PubMed's suggested wait when it is longer than our own backoff.
          const retryAfter = response.headers.get("retry-after");
          const seconds = retryAfter === null ? NaN : Number(retryAfter);
          const retryDelay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now();
          const delay = Math.max(1000 * 2 ** attempt, retryDelay || 0);
          await response.body?.cancel();
          if (delay > 30000) throw new Error("PubMed is busy. Please try again later.");
          await sleep(delay);
          continue;
        }

        const data = await response.json();

        // PubMed sometimes reports a rate limit inside a successful HTTP response.
        if (String(data.error || "").toLowerCase().includes("rate limit") && attempt < 2) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }

        return data;
      }
    });

    // A failed request should not stop the next search in the queue.
    queue = task.catch(() => {});

    return task;
  }

  // Find matching paper IDs first, then fetch their details in one batch.
  return async function search({ topic, startYear, endYear, maxPapers }) {
    const params = { term: topic, retmax: String(maxPapers), sort: "relevance" };

    if (startYear !== null || endYear !== null) {
      Object.assign(params, {
        datetype: "pdat", mindate: `${startYear ?? 1800}/01/01`,
        maxdate: `${endYear ?? new Date().getFullYear()}/12/31`,
      });
    }

    const data = await request("esearch.fcgi", params);
    const ids = data.esearchresult?.idlist;
    const totalMatches = Number(data.esearchresult?.count);

    if (data.error || data.esearchresult?.ERROR || !Array.isArray(ids) || !Number.isFinite(totalMatches)) {
      throw new Error("Invalid PubMed search response.");
    }

    if (!ids.length) return { totalMatches, papers: [] };

    const summary = await request("esummary.fcgi", { id: ids.join(",") });

    // Give the frontend one consistent paper format, even when fields are missing.
    const papers = ids.map((id) => {
      const paper = summary.result?.[id];
      if (!paper || paper.error) throw new Error("Invalid PubMed paper response.");

      return {
        id, title: paper.title || "Untitled paper",
        authors: (paper.authors || []).filter((author) => author.authtype === "Author")
          .map((author) => author.name).filter(Boolean),
        journal: paper.fulljournalname || paper.source || "Unknown",
        date: paper.pubdate || "",
        year: Number(paper.pubdate?.match(/\b\d{4}\b/)?.[0]) || null,
      };
    });

    return { totalMatches, papers: normalizeAuthors(papers) };
  };
}
