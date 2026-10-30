import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { createCache } from "../src/cache.js";
import { createPubmedClient } from "../src/pubmed.js";
import { buildGraph, normalizeAuthors, possibleVariants } from "../../shared/graph.mjs";

test("graph counts solo authors and repeated pairs once per paper", () => {
  const graph = buildGraph([
    { authors: ["A", "B", "A"] }, { authors: ["B", "A"] }, { authors: ["Solo"] },
  ]);
  assert.equal(graph.nodes.find((node) => node.name === "A").paperCount, 2);
  assert.deepEqual(graph.links, [{ source: "A", target: "B", sharedPapers: 2 }]);
  assert.ok(graph.nodes.some((node) => node.name === "Solo"));
  assert.equal(buildGraph([{ authors: [] }]).nodes.length, 0);
  assert.equal(buildGraph([{ authors: ["Solo"] }], { minPapers: 2 }).nodes.length, 0);
});

test("51-author papers work and dense graphs have explicit limits", () => {
  const papers = [{ authors: Array.from({ length: 51 }, (_, i) => `Author ${i}`) }];
  assert.equal(buildGraph(papers).links.length, 1275);
  const dense = buildGraph([{ authors: Array.from({ length: 300 }, (_, i) => `A ${i}`) }]);
  assert.equal(dense.authors.length, 300);
  assert.equal(dense.nodes.length, 200);
  assert.equal(dense.links.length, 2000);
  assert.equal(dense.hiddenAuthors, 100);
  assert.equal(dense.hiddenLinks, 17900);
});

test("formatting variants merge but ambiguous initials remain distinct", () => {
  const papers = normalizeAuthors([
    { authors: [" Smith   J. ", "smith j", "Smith JA", "Smith JB"] },
  ]);
  assert.deepEqual(papers[0].authors, ["Smith J", "Smith JA", "Smith JB"]);
  assert.deepEqual(possibleVariants("Smith J", papers[0].authors), ["Smith JA", "Smith JB"]);
  assert.deepEqual(possibleVariants("Smith JA", papers[0].authors), ["Smith J"]);
});

test("cache reuses concurrent searches, expires, evicts and discards failures", async () => {
  let clock = 0, calls = 0;
  const remember = createCache({ ttl: 100, maxEntries: 2, now: () => clock });
  const load = async () => ++calls;
  const [first, second] = await Promise.all([remember("a", load), remember("a", load)]);
  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  clock = 101;
  await remember("a", load);
  assert.equal(calls, 2);
  await remember("b", load);
  await remember("c", load);
  assert.equal((await remember("a", load)).cached, false);
  await assert.rejects(remember("bad", async () => { throw Error("offline"); }));
  assert.equal((await remember("bad", load)).cached, false);
});

// Pretend to be PubMed so tests can check timing and responses without the internet.
function fakeClient(responses, apiKey = "") {
  let clock = 0;
  const requests = [];
  const search = createPubmedClient({
    apiKey, now: () => clock, sleep: async (ms) => { clock += ms; },
    fetchImpl: async (url) => {
      requests.push({ url: new URL(url), time: clock });
      const response = responses.shift();
      assert.ok(response, "Unexpected extra upstream request");
      return response;
    },
  });
  return { search, requests };
}
const inputs = { topic: "test", startYear: null, endYear: null, maxPapers: 10 };
const searchResponse = () => Response.json({ esearchresult: { idlist: ["123"], count: "20" } });
const emptyResponse = () => Response.json({ esearchresult: { idlist: [], count: "0" } });
const summaryResponse = () => Response.json({ result: { "123": {
  title: "Study", authors: [{ authtype: "Author", name: "Smith J" }],
  pubdate: "2024 Jan", source: "Journal",
} } });

test("PubMed uses both endpoints, dates and optional API keys", async () => {
  for (const apiKey of ["", "test-secret"]) {
    const { search, requests } = fakeClient([searchResponse(), summaryResponse()], apiKey);
    const result = await search({ ...inputs, startYear: 2020 });
    assert.equal(result.totalMatches, 20);
    assert.equal(result.papers[0].year, 2024);
    assert.equal(requests[0].url.searchParams.get("retmax"), "10");
    assert.equal(requests[0].url.searchParams.get("mindate"), "2020/01/01");
    assert.ok(requests[1].url.pathname.endsWith("esummary.fcgi"));
    assert.equal(requests[1].url.searchParams.get("id"), "123");
    assert.ok(requests[1].time - requests[0].time >= (apiKey ? 120 : 400));
    for (const { url } of requests) assert.equal(url.searchParams.get("api_key"), apiKey || null);
    assert.ok(!JSON.stringify(result).includes("test-secret"));
  }
});

test("all concurrent searches share the throttle and an empty search skips ESummary", async () => {
  const { search, requests } = fakeClient([emptyResponse(), emptyResponse(), emptyResponse()]);
  await Promise.all([search(inputs), search(inputs), search(inputs)]);
  assert.deepEqual(requests.map((request) => request.time), [0, 400, 800]);
  assert.equal(requests[0].url.searchParams.has("mindate"), false);
});

test("rate limits retry with Retry-After and exhausted failures stop", async () => {
  const { search, requests } = fakeClient([
    new Response("Busy", { status: 429, headers: { "retry-after": "2" } }), emptyResponse(),
  ]);
  await search(inputs);
  assert.ok(requests[1].time >= 2000);
  const failed = fakeClient(Array.from({ length: 3 }, () => new Response("Down", { status: 503 })));
  await assert.rejects(failed.search(inputs));
  assert.equal(failed.requests.length, 3);
  const malformed = fakeClient([Response.json({ error: "Invalid query" })]);
  await assert.rejects(malformed.search(inputs));
});

test("a failed request does not block the next queued search", async () => {
  const client = fakeClient([Response.json({ error: "Bad query" }), emptyResponse()]);
  await assert.rejects(client.search(inputs));
  assert.deepEqual(await client.search(inputs), { totalMatches: 0, papers: [] });
});

test("a cache full of pending searches refuses extra work", async () => {
  const remember = createCache({ maxEntries: 1 });
  let finish;
  const first = remember("a", () => new Promise((resolve) => { finish = resolve; }));
  await Promise.resolve();
  await assert.rejects(remember("b", async () => 2), /queue is full/);
  finish(1);
  await first;
  assert.equal((await remember("b", async () => 2)).value, 2);
});

test("HTTP API validates, returns graphs, caches results and hides upstream errors", async (t) => {
  let calls = 0;
  const app = createApp({ searchPubmed: async ({ topic }) => {
    calls++;
    if (topic === "fail") throw Error("secret-key-in-upstream-url");
    return { totalMatches: 2, papers: [{ id: "1", title: "Test", authors: ["A", "B"], year: 2024 }] };
  } });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const params of ["", "topic=x&maxPapers=101", "topic=x&maxPapers=1.5", "topic=x&startYear=2025&endYear=2020"]) {
    assert.equal((await fetch(`${base}/api/search?${params}`)).status, 400);
  }
  const first = await (await fetch(`${base}/api/search?topic=test&maxPapers=10`)).json();
  assert.equal(first.appliedMaxPapers, 10);
  assert.equal(first.nodes.length, 2);
  assert.equal(first.links[0].sharedPapers, 1);
  assert.equal(first.cached, false);
  const second = await (await fetch(`${base}/api/search?topic=test&maxPapers=10`)).json();
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
  const defaultLimit = await (await fetch(`${base}/api/search?topic=test`)).json();
  assert.equal(defaultLimit.appliedMaxPapers, 100);
  const failure = await fetch(`${base}/api/search?topic=fail`);
  assert.equal(failure.status, 502);
  assert.ok(!(await failure.text()).includes("secret-key"));
  assert.equal((await fetch(`${base}/api/missing`)).status, 404);
});
