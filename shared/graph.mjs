// Tidy up name formatting, but keep uncertain names like Smith J and Smith JA separate.
export function normalizeAuthors(papers) {
  const names = new Map();

  return papers.map((paper) => ({
    ...paper,
    authors: [...new Set(paper.authors.map((name) => {
      const cleaned = name.normalize("NFKC").trim().replace(/\s+/g, " ")
        .replace(/\.(?=\s|[A-Z]|$)/g, "");
      const key = cleaned.toLowerCase();
      if (!names.has(key)) names.set(key, cleaned);

      return names.get(key);
    }).filter(Boolean))],
  }));
}

// Suggest names with similar initials without claiming they are the same person.
export function possibleVariants(name, authors) {
  // PubMed usually writes a name as a surname followed by initials.
  const split = (value) => value.match(/^(.+) ([A-Z]{1,6})$/i);

  const selected = split(name);
  if (!selected) return [];

  return authors.filter((other) => {
    const candidate = split(other);
    if (!candidate || other === name) return false;

    const [, surname, initials] = selected;
    const [, otherSurname, otherInitials] = candidate;

    return surname.toLowerCase() === otherSurname.toLowerCase() &&
      (initials.toLowerCase().startsWith(otherInitials.toLowerCase()) ||
       otherInitials.toLowerCase().startsWith(initials.toLowerCase()));
  });
}

// Turn papers into author dots and shared-paper lines, with limits for readability.
export function buildGraph(papers, { minPapers = 1, maxNodes = 200, maxLinks = 2000 } = {}) {
  const counts = new Map();

  for (const paper of papers) {
    for (const name of new Set(paper.authors)) counts.set(name, (counts.get(name) || 0) + 1);
  }

  // Count everyone, then choose which authors fit in the displayed graph.
  const authors = [...counts].map(([name, paperCount]) => ({ id: name, name, paperCount }))
    .sort((a, b) => b.paperCount - a.paperCount || a.name.localeCompare(b.name));
  const eligible = authors.filter((author) => author.paperCount >= minPapers);
  const nodes = eligible.slice(0, maxNodes).map((author) => ({ ...author }));
  const visible = new Set(nodes.map((node) => node.id));
  const pairs = new Map();

  // Each pair gets one count per shared paper. A solo author simply has no pairs.
  for (const paper of papers) {
    const names = [...new Set(paper.authors)].filter((name) => visible.has(name)).sort();
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const key = JSON.stringify([names[i], names[j]]);
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  }

  // Keep the strongest links first when there are too many to show clearly.
  const links = [...pairs].map(([key, sharedPapers]) => {
    const [source, target] = JSON.parse(key);
    return { source, target, sharedPapers };
  }).sort((a, b) => b.sharedPapers - a.sharedPapers ||
    a.source.localeCompare(b.source) || a.target.localeCompare(b.target));

  return {
    authors, nodes, links: links.slice(0, maxLinks),
    hiddenAuthors: eligible.length - nodes.length,
    hiddenLinks: Math.max(0, links.length - maxLinks),
  };
}
