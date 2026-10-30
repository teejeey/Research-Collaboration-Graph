# Four-minute walkthrough

Record the browser and your narration. Keep `.env` and account settings off screen. Use your own words and explain the code you understand.

| Time | Show | Explain |
| --- | --- | --- |
| 0:00–0:30 | Search `semaglutide obesity`, years 2020 to the current year, max 50 | The backend calls ESearch, then ESummary. These are relevance-ranked results, not every paper in the field. |
| 0:30–1:10 | Paper count, author-name count, year range; expand paper list | What the summary represents, and where paper metadata comes from. |
| 1:10–1:50 | Zoom, pan, drag and hover; click an author | Node area follows paper count, line thickness follows shared papers. Show papers and top collaborators in the panel. |
| 1:50–2:25 | Search an author, change years and minimum papers | Filters run locally. Dashboards follow years; network visibility limits do not change dashboard totals. |
| 2:25–3:00 | Top authors, journals and yearly chart; repeat the original search | Explain cache reuse and the 30-minute lifetime. |
| 3:00–3:40 | Open `shared/graph.mjs`, `backend/src/cache.js` and `backend/src/pubmed.js` | Explain pairs, the 200-node/2,000-link caps, shared request queue and retries. Do not open `.env`. |
| 3:40–4:10 | README and test output | Explain ambiguous names, in-memory storage, sampling and AI assistance. Mention that name variants are suggestions, not verified identities. |

Before recording, run `npm test`, `npm run lint`, and `npm run build`. Start the backend with `npm start`, open `http://localhost:3001`, and make one practice search. If PubMed is temporarily unavailable, wait and try again; do not present mock data as a live search.

After recording, upload the video using your preferred service and put its share link in the root README. The assignment asks for 3–5 minutes; this script targets about four minutes.
