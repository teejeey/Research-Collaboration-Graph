# Backend

This is the Express server. It fetches PubMed papers, builds the author network and keeps recent searches in memory.

From this folder, install dependencies and start the server:

```sh
npm ci
npm run dev
```

It runs at `http://localhost:3001` by default. You can use `npm start` instead if you do not need automatic restarts while editing.

If `.env` does not exist, copy `.env.example` to `.env`. Add your optional NCBI key to `PUBMED_API_KEY`. Keep the key here, away from the frontend, and restart the server after changing it. Git ignores this file.

Run `npm test` to check the backend and shared graph code. The tests do not call the real PubMed API.

The [main README](../README.md) explains the API, cache, graph limits and known limitations.
