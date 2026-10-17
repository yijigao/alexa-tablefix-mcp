# TableFix MCP — Simulated Alexa+ Table Cleaner

Submission for the **Amazon Developer Hackathon** (Alexa+ track) + **Open Source mini challenge**.

Paste messy delimited text, get back a clean table — exposed as a self-hosted
**MCP server** (MCP spec 2025-11-25, Streamable HTTP) with a simulated Alexa+
conversational layer on top.

> **Note:** Alexa+'s MCP add-on deployment pipeline is currently partner-only,
> so per the official hackathon rules this project ships the sanctioned
> alternative: a real, spec-compliant MCP server plus a **simulated Alexa+
> experience** web app that calls the same server. The simulation layer is
> clearly labeled in the UI.

## What's inside

- `server.js` — local dev MCP server (Express, stateless Streamable HTTP, port 3000)
- `api/mcp.js` — same logic as a Vercel serverless function (`/api/mcp`)
- `detect.js` — table/delimiter detection (ported from the TableFix project)
- `sim-web/` — simulated Alexa+ chat UI (calls the MCP server, downloads `.xlsx`)
- `vercel.json` — rewrites `/mcp` → `/api/mcp`

## Tools

| Tool | Input | Output |
|---|---|---|
| `detect_table` | messy text | delimiter, columns, confidence, scores, suspect rows |
| `clean_messy_text` | messy text, `header?` | cleaned rows (JSON), delimiter, suspect rows |

## Run locally

```sh
npm install
npm start        # MCP server on http://localhost:3000
cd sim-web && node serve.js   # UI on http://localhost:8080
```

Verify: `npm run verify` (or see `verification.log`).

## Friction log

See [FRICTION-LOG.md](FRICTION-LOG.md) — real integration notes, kept from day one.

## License

MIT — see [LICENSE](LICENSE).
