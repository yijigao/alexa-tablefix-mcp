# Friction Log

Kept from day one of the build. Submitted for the hackathon's +10% judging bonus.

## 2026-10-17 — MCP SDK Streamable HTTP in stateless mode

- **Attempted:** `StreamableHTTPServerTransport` with `sessionIdGenerator: undefined`
  (stateless), `enableJsonResponse: true`, one server+transport per request.
- **Expected:** any JSON-RPC request handled independently, no session handshake.
- **Observed:** works. (Correction, same day: an earlier draft of this entry
  claimed that sending `tools/list` as the very first request returns 400 "because
  the SDK requires the initialize flow". That was wrong — the 400 came from an
  overly simplified mock of `req`/`res` in our own unit tests, not from the SDK.
  The real local HTTP handler accepted `tools/list` directly, and the live
  handler was verified working afterward. The UI still opens with
  `initialize` → `notifications/initialized` first, as good practice.)
- **Severity:** low (test-mock artifact, not a framework bug).
- **Workaround:** sim-web UI always opens with initialize + initialized notification.
- **Suggestion for Amazon:** the "simulated Alexa+ experience" path is well
  documented, but a public sandbox endpoint for testing the real Alexa+ ← MCP
  call path would unlock far more ambitious submissions.

## 2026-10-17 — Vercel serverless adaptation

- **Attempted:** reuse the Express server code inside a Vercel serverless function.
- **Expected:** drop-in.
- **Observed:** the SDK's Node transport delegates to `@hono/node-server`'s
  request listener, which needs real Node `req`/`res` objects — naive mocks in
  unit tests return 400. Also, Vercel functions need manual JSON body parsing.
- **Severity:** low.
- **Workaround:** `api/mcp.js` parses the body stream manually and passes real
  `req`/`res` through; verified with a live local HTTP server.
- **Suggestion:** none — framework behavior, well understood after reading SDK source.

## 2026-10-17 — SheetJS browser bundle

- **Attempted:** `.xlsx` download fully client-side (no server round-trip).
- **Expected:** need the SheetJS CE browser bundle.
- **Observed:** `vendor/xlsx.full.min.js` (Apache-2.0) works offline; 16 KB output
  for a 4-row table, valid ZIP magic. No CDN needed — good for sandboxed demos.
- **Severity:** none.
- **Suggestion:** none.
