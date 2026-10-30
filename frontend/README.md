# Frontend

This is the React app. It shows the search form, author network, paper list and research charts.

Start the backend first. Then, from this folder, run:

```sh
npm ci
npm run dev
```

Open the address Vite prints, usually `http://localhost:5173`. Search requests go through Vite to the backend on port 3001.

Useful commands:

- `npm run lint` checks the frontend code.
- `npm run build` creates the production files.

Keep the PubMed key in `backend/.env`; the frontend does not need it.

For the full setup, project decisions and limitations, see the [main README](../README.md).
