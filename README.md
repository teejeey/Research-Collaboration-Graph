Research Collaboration Graph

This app searches PubMed and shows authors who wrote papers together.
It uses React, Express, react-force-graph-2d and Recharts.

Setup

Install Node.js 22.12 or newer.
Run these commands from the project folder:

npm --prefix backend ci
npm --prefix frontend ci

If backend/.env does not exist, copy backend/.env.example to backend/.env.
Add your NCBI API key to PUBMED_API_KEY if you have one.
The key is optional. Keep it in the backend. Git ignores the .env file.
Restart the backend after changing it.

Start the backend in one terminal:

npm run backend

Start the frontend in another terminal:

npm run dev

Open http://localhost:5173 or the address printed by Vite.
The backend uses port 3001 by default.
If you change that port, update frontend/vite.config.js too.

To run the production build:

npm run build
npm start

Then open http://localhost:3001.

Using the app

Enter a topic such as semaglutide obesity.
You can add a year range and a paper limit.
The default and maximum limit is 100 papers.

Each dot is an author. Larger dots mean more papers.
Each line connects two authors. Thicker lines mean more shared papers.
Drag and zoom to explore. Hover to see a name and paper count.
Click an author to see their papers and top collaborators.

Search for an author or filter by year and minimum paper count.
Year filters also update the paper list and dashboard.
The dashboard shows paper counts, author names, journals and publication years.
It also shows the top 10 authors, top 10 journals and papers per year.

How it works

The backend calls ESearch to find paper IDs.
It then calls ESummary to get paper details.
The API returns papers, author nodes and collaboration links.
The frontend uses the shared graph code when filters change.

Recent searches stay in memory for 30 minutes.
The cache holds up to 50 searches. Restarting the server clears it.
This keeps setup simple without needing a database.

PubMed requests share a queue in this server.
Requests wait at least 400ms apart without a key, or 120ms with one.
Busy responses get up to two retries. Each request has a 15-second timeout.
Other server instances or apps sharing the same key are outside this queue.

Names are cleaned for spacing, case and periods.
Smith J and Smith JA stay separate because initials cannot confirm identity.
The author panel shows possible name variants.
Different people with the same name may still be counted together.

The graph shows up to 200 authors and 2,000 strongest links between them.
These limits help keep it readable and fast.
Hidden names remain available in author search. Dashboard counts use all filtered papers.
Single-author papers create a dot without lines.
Large author lists are supported, but display limits still apply.

API

GET /api/health checks the server.
GET /api/search?topic=semaglutide%20obesity&maxPapers=50 runs a search.
You can also send startYear and endYear.
Invalid inputs return 400. PubMed failures return 502.

Limitations

Results cover at most 100 relevance-ranked papers, not the whole research field.
Author counts represent names, not verified people.
Unknown publication years are excluded from the year chart and active year filters.
Group authors are excluded from person-name nodes.
There is no permanent database or login.
The optional bonus features are not included.

Checks

Run these commands from the project folder:

npm test
npm run lint
npm run build

Tests use sample PubMed responses and do not need internet access or an API key.

AI use

I used OpenAI Codex to help review the code, simplify it, add features, and write tests and documentation.
I need to understand the code and explain its choices during the walkthrough.

Submission

Repository: https://github.com/teejeey/Research-Collaboration-Graph
The latest local changes still need to be committed and pushed.
The screen recording has not been added. DEMO.md contains a recording plan.

Data comes from PubMed.
NCBI disclaimer and copyright: https://www.ncbi.nlm.nih.gov/About/disclaimer.html
