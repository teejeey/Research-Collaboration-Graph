import { useEffect, useMemo, useRef, useState } from "react";
import NetworkGraph from "./NetworkGraph.jsx";
import { buildGraph, possibleVariants } from "../../shared/graph.mjs";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import "./App.css";

const currentYear = new Date().getFullYear();
const years = Array.from(
  { length: currentYear - 1800 + 1 },
  (_, index) => currentYear - index
);

// Show the ten authors or journals with the most papers.
function RankingChart({ title, data, color }) {
  return (
    <article className="chart-card">
      <h3>{title}</h3>

      {data.length === 0 ? (
        <p>No data available.</p>
      ) : (
        <div className="chart-frame">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                stroke="#e7ede7"
              />

              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                type="category"
                dataKey="name"
                width={130}
                interval={0}
                tickFormatter={(name) =>
                  name.length > 21 ? `${name.slice(0, 21)}…` : name
                }
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />

              <Tooltip
                formatter={(value) => [value, "Papers"]}
                cursor={{ fill: "#f0f5ef" }}
              />

              <Bar
                dataKey="count"
                fill={color}
                radius={[0, 5, 5, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </article>
  );
}

const EMPTY_RESULT = {
  papers: [], authors: [], nodes: [], links: [],
  totalMatches: 0, appliedMaxPapers: 100, cached: false,
};

// Keep the search, filters, dashboard and author panel together on one page.
function App() {
  const [topic, setTopic] = useState("");
  // Keep the backend response together instead of copying it into several states.
  const [result, setResult] = useState(EMPTY_RESULT);
  const dialogRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState(null);

  // These inputs decide which papers we ask PubMed for.
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [maxPapers, setMaxPapers] = useState("");

  // These filters work on the papers we have already loaded.
  const [filterFromYear, setFilterFromYear] = useState("");
  const [filterToYear, setFilterToYear] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");
  const [minPapers, setMinPapers] = useState("1");

  const { papers, totalMatches, appliedMaxPapers, cached } = result;

  // Open or close the browser's dialog when the selected author changes.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (selectedAuthor && !dialog.open) dialog.showModal();
    if (!selectedAuthor && dialog.open) dialog.close();
  }, [selectedAuthor]);

  // Offer only years that actually appear in the loaded papers.
  const resultYears = useMemo(
    () =>
      [...new Set(papers.map((paper) => paper.year))]
        .filter(Number.isInteger)
        .sort((a, b) => a - b),
    [papers]
  );

  // Keep papers inside the chosen years. Unknown years only appear without a filter.
  const filteredPapers = useMemo(() => {
    return papers.filter((paper) => {
      if (!filterFromYear && !filterToYear) return true;
      if (!Number.isInteger(paper.year)) return false;

      return (
        (!filterFromYear || paper.year >= Number(filterFromYear)) &&
        (!filterToYear || paper.year <= Number(filterToYear))
      );
    });
  }, [papers, filterFromYear, filterToYear]);

  // Reuse the backend graph until a filter makes us rebuild it locally.
  const filteredGraph = useMemo(() => {
    if (!filterFromYear && !filterToYear && Number(minPapers) === 1) return result;
    return buildGraph(filteredPapers, { minPapers: Math.max(1, Number(minPapers) || 1) });
  }, [result, filteredPapers, filterFromYear, filterToYear, minPapers]);

  // Build the dashboard from all year-filtered papers, including hidden graph nodes.
  const insights = useMemo(() => {
    const authors = new Map();
    const journals = new Map();
    const yearCounts = new Map();
    let unknownYearCount = 0;

    for (const paper of filteredPapers) {
      for (const name of new Set(paper.authors)) {
        authors.set(name, (authors.get(name) || 0) + 1);
      }

      const journal = paper.journal || "Unknown";
      journals.set(journal, (journals.get(journal) || 0) + 1);

      if (Number.isInteger(paper.year)) {
        yearCounts.set(
          paper.year,
          (yearCounts.get(paper.year) || 0) + 1
        );
      } else {
        unknownYearCount++;
      }
    }

    // Put the largest counts first and use names to break ties consistently.
    const rankTop10 = (counts) =>
      [...counts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

    const knownYears = [...yearCounts.keys()].sort((a, b) => a - b);
    const firstYear = knownYears[0];
    const lastYear = knownYears[knownYears.length - 1];

    const papersPerYear = knownYears.length
      ? Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
          const year = firstYear + index;
          return { year, count: yearCounts.get(year) || 0 };
        })
      : [];

    const yearRange = knownYears.length
      ? firstYear === lastYear
        ? String(firstYear)
        : `${firstYear}–${lastYear}`
      : "Unknown";

    return {
      cards: [
        { label: "Papers", value: filteredPapers.length },
        { label: "Author names", value: authors.size },
        {
          label: "Known journals",
          value: [...journals.keys()].filter((name) => name !== "Unknown")
            .length,
        },
        { label: "Publication years", value: yearRange },
      ],
      topAuthors: rankTop10(authors),
      topJournals: rankTop10(journals),
      papersPerYear,
      unknownYearCount,
    };
  }, [filteredPapers]);

  const searchText = authorSearch.trim().toLowerCase();

  const matchingAuthors = searchText
    ? filteredGraph.authors.filter((node) =>
        node.name.toLowerCase().includes(searchText)
      )
    : [];

  const variants = selectedAuthor
    ? possibleVariants(selectedAuthor, result.authors.map((author) => author.name))
    : [];

  const authorPapers = selectedAuthor
    ? filteredPapers.filter((paper) =>
        paper.authors.includes(selectedAuthor)
      )
    : [];

  const collaboratorCounts = new Map();

  for (const paper of authorPapers) {
    for (const name of new Set(paper.authors)) {
      if (name !== selectedAuthor) {
        collaboratorCounts.set(
          name,
          (collaboratorCounts.get(name) || 0) + 1
        );
      }
    }
  }

  const topCollaborators = [...collaboratorCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10);

  // Clear the end year if the new start year would make the range invalid.
  function changeStartYear(event) {
    const year = event.target.value;
    setStartYear(year);

    if (year && endYear && Number(year) > Number(endYear)) {
      setEndYear("");
    }
  }

  // Keep the local year range valid and close details from the old results.
  function changeFilterFromYear(event) {
    const year = event.target.value;
    setFilterFromYear(year);
    setSelectedAuthor(null);

    if (year && filterToYear && Number(year) > Number(filterToYear)) {
      setFilterToYear("");
    }
  }

  // Apply the local end year and clear the open author panel.
  function changeFilterToYear(event) {
    setFilterToYear(event.target.value);
    setSelectedAuthor(null);
  }

  // Update the minimum count while the user is typing.
  function changeMinPapers(event) {
    setMinPapers(event.target.value);
    setSelectedAuthor(null);
  }

  // When the user leaves the field, keep its value between 1 and 100.
  function finishMinPapers() {
    const value = Math.min(100, Math.max(1, Math.floor(Number(minPapers) || 1)));
    setMinPapers(String(value));
  }

  // Use the same close action for the button, Escape key and dialog event.
  function closeAuthorPanel() {
    setSelectedAuthor(null);
  }

  // Bring the local filters back to their starting values.
  function resetGraphFilters() {
    setFilterFromYear("");
    setFilterToYear("");
    setMinPapers("1");
    setAuthorSearch("");
    setSelectedAuthor(null);
  }

  // Check the form, ask our backend for papers, and update the page with the result.
  async function searchPapers(event) {
    event.preventDefault();

    if (!topic.trim()) {
      setError("Enter a topic or paper title.");
      return;
    }

    if (startYear && endYear && Number(startYear) > Number(endYear)) {
      setError("From year must not be later than To year.");
      return;
    }

    if (
      maxPapers !== "" &&
      (!Number.isInteger(Number(maxPapers)) ||
        Number(maxPapers) < 1 ||
        Number(maxPapers) > 100)
    ) {
      setError("Maximum papers must be between 1 and 100.");
      return;
    }

    setLoading(true);
    setError("");
    resetGraphFilters();
    setResult(EMPTY_RESULT);

    try {
      const params = new URLSearchParams({ topic: topic.trim() });

      if (startYear) params.set("startYear", startYear);
      if (endYear) params.set("endYear", endYear);
      if (maxPapers !== "") params.set("maxPapers", String(maxPapers));

      const response = await fetch(`/api/search?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Search failed");
      }

      setResult(data);

      if (data.papers.length === 0) {
        setError("No papers found. Try another topic or year range.");
      }
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app">
      <h1>Research Collaboration Graph</h1>
      <p>
        Explore authors and their collaborations using PubMed papers.
      </p>

      <form className="search-form" onSubmit={searchPapers}>
        <label>
          Topic or paper title
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. semaglutide obesity"
            required
          />
        </label>

        <label>
          From year · optional
          <select value={startYear} onChange={changeStartYear}>
            <option value="">Any year</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>

        <label>
          To year · optional
          <select
            value={endYear}
            onChange={(event) => setEndYear(event.target.value)}
          >
            <option value="">Any year</option>
            {years
              .filter((year) => !startYear || year >= Number(startYear))
              .map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
          </select>
        </label>

        <label>
          Maximum papers · optional
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            value={maxPapers}
            onChange={(event) => setMaxPapers(event.target.value)}
            placeholder="Default: 100"
          />
        </label>

        <button type="submit" disabled={loading || !topic.trim()}>
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {loading && <p role="status">Fetching papers from PubMed...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {papers.length > 0 && (
        <>
          <p className="summary">
            Loaded {papers.length} of {totalMatches.toLocaleString()}{" "}
            matching papers. Search limit: {appliedMaxPapers}.
            {cached && " Cached result."}
          </p>

          <section aria-label="Research overview">
            <div className="kpi-grid">
              {insights.cards.map((card) => (
                <article className="kpi-card" key={card.label}>
                  <span>{card.label}</span>
                  <strong>
                    {typeof card.value === "number"
                      ? card.value.toLocaleString()
                      : card.value}
                  </strong>
                </article>
              ))}
            </div>

            <p className="dashboard-note">
              Counts represent author names, not verified identities.
            </p>
          </section>

          <section className="network-section">
            <h2>Author network</h2>
            <p>
              Drag to move, scroll to zoom, and click an author for details.
            </p>

            <div className="graph-controls">
              <label>
                Filter from year
                <select
                  value={filterFromYear}
                  onChange={changeFilterFromYear}
                >
                  <option value="">All years</option>
                  {resultYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </label>

              <label>
                Filter to year
                <select
                  value={filterToYear}
                  onChange={changeFilterToYear}
                >
                  <option value="">All years</option>
                  {resultYears
                    .filter(
                      (year) =>
                        !filterFromYear || year >= Number(filterFromYear)
                    )
                    .map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                </select>
              </label>

              <label>
                Minimum papers per author
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={minPapers}
                  onChange={changeMinPapers}
                  onBlur={finishMinPapers}
                />
              </label>

              <label>
                Find an author
                <input
                  value={authorSearch}
                  onChange={(event) => setAuthorSearch(event.target.value)}
                  placeholder="Type an author's name"
                />
              </label>
            </div>

            <p>
              Showing {filteredGraph.nodes.length} authors and {filteredGraph.links.length} links.
            </p>

            <button type="button" onClick={resetGraphFilters}>
              Reset graph filters
            </button>

            <p className="legend">
              Sage: author · Green: search match · Orange: selected author
            </p>

            {(filteredGraph.hiddenAuthors > 0 || filteredGraph.hiddenLinks > 0) && (
              <p className="dashboard-note" role="status">
                Graph limit: 200 authors and 2,000 links. Hidden: {filteredGraph.hiddenAuthors}
                {" "}authors and {filteredGraph.hiddenLinks} links between displayed authors.
                All filtered papers remain in the dashboard and author search.
              </p>
            )}

            {searchText && (
              <div>
                <p>Matching authors: {matchingAuthors.length}</p>
                <ul className="author-results">
                  {matchingAuthors.map((author) => (
                    <li key={author.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedAuthor(author.name)}
                      >
                        {author.name}
                      </button>
                      {" — "}
                      {author.paperCount}{" "}
                      {author.paperCount === 1 ? "paper" : "papers"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {filteredGraph.nodes.length === 0 ? (
              <p>
                No authors match these filters. Try a wider year range
                or a lower minimum paper count.
              </p>
            ) : (
              <NetworkGraph
                graph={filteredGraph}
                selectedAuthor={selectedAuthor}
                searchText={searchText}
                onSelect={setSelectedAuthor}
              />
            )}
          </section>

          <details className="paper-results">
            <summary>Papers ({filteredPapers.length})</summary>
            {filteredPapers.map((paper) => (
              <article className="author-paper" key={paper.id}>
                <a href={"https://pubmed.ncbi.nlm.nih.gov/" + paper.id + "/"} target="_blank" rel="noopener noreferrer">{paper.title}</a>
                <p>{paper.journal} - {paper.date || "Unknown date"}</p>
                <p>{paper.authors.join(", ") || "No named authors available"}</p>
              </article>
            ))}
          </details>

          <section className="dashboard-section">
            <div className="dashboard-heading">
              <h2>Dashboard</h2>
              <p>
                Based on the papers within the selected years.
              </p>
            </div>

            {filteredPapers.length === 0 ? (
              <p>No papers match the selected years.</p>
            ) : (
              <div className="insights-grid">
                <RankingChart
                  title="Top 10 authors"
                  data={insights.topAuthors}
                  color="#528675"
                />

                <RankingChart
                  title="Top 10 journals"
                  data={insights.topJournals}
                  color="#8fa77a"
                />

                <article className="chart-card chart-card-wide">
                  <h3>Papers per year</h3>

                  {insights.papersPerYear.length === 0 ? (
                    <p>No publication years available.</p>
                  ) : (
                    <div className="year-chart-frame">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={insights.papersPerYear}
                          margin={{
                            top: 16,
                            right: 16,
                            bottom: 8,
                            left: 0,
                          }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#e7ede7"
                          />

                          <XAxis
                            dataKey="year"
                            tick={{ fontSize: 11 }}
                            minTickGap={24}
                            axisLine={false}
                            tickLine={false}
                          />

                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />

                          <Tooltip
                            labelFormatter={(year) => `Year: ${year}`}
                            formatter={(value) => [value, "Papers"]}
                            cursor={{ fill: "#f0f5ef" }}
                          />

                          <Bar
                            dataKey="count"
                            fill="#528675"
                            radius={[5, 5, 0, 0]}
                            maxBarSize={40}
                            isAnimationActive={false}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {insights.unknownYearCount > 0 && (
                    <p>
                      {insights.unknownYearCount} papers have an unknown
                      year and are excluded from this chart.
                    </p>
                  )}
                </article>
              </div>
            )}
          </section>
        </>
      )}

      <dialog
        ref={dialogRef}
        className="author-sidebar"
        aria-label="Author details"
        onCancel={closeAuthorPanel}
        onClose={closeAuthorPanel}
      >
        <header className="author-sidebar-header">
          <div>
            <h2>{selectedAuthor}</h2>
          </div>

          <button
            type="button"
            aria-label="Close author details"
            onClick={closeAuthorPanel}
          >
            ✕
          </button>
        </header>

        <div className="author-sidebar-content">
          <p>
            <strong>{authorPapers.length}</strong> papers in the
            filtered results
          </p>

          {variants.length > 0 && (
            <div className="name-variants">
              <h3>Possible name variants</h3>
              <p>Similar initials may belong to the same person. These names are kept separate.</p>
              <ul>{variants.map((name) => <li key={name}>{name}</li>)}</ul>
            </div>
          )}

          <h3>Papers</h3>

          {authorPapers.map((paper) => (
            <article className="author-paper" key={paper.id}>
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${paper.id}/`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {paper.title}
              </a>
              <p>{paper.journal} — {paper.date}</p>
            </article>
          ))}

          <h3>Top collaborators</h3>
          <p>
            Ranked by shared papers in the selected years.
          </p>

          {topCollaborators.length === 0 ? (
            <p>No collaborators in these results.</p>
          ) : (
            <ol className="collaborator-list">
              {topCollaborators.map(([name, count]) => (
                <li key={name}>
                  <strong>{name}</strong>
                  <span>
                    {count} shared {count === 1 ? "paper" : "papers"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </dialog>
      <footer className="dashboard-note">
        Data from <a href="https://pubmed.ncbi.nlm.nih.gov/">PubMed</a>.
        {" "}<a href="https://www.ncbi.nlm.nih.gov/About/disclaimer.html">NCBI disclaimer and copyright</a>.
      </footer>
    </main>
  );
}

export default App;
