# Simulated Alexa+ table cleaner

This is a simulated Alexa+ experience for a hackathon submission. The visible banner identifies the simulation layer. It uses a local MCP server for table detection and cleaning, and generates spreadsheets in the browser.

## Setup and launch

Place the SheetJS Community Edition browser bundle at `vendor/xlsx.full.min.js` inside this directory (create `vendor/` if necessary). Obtain and supply that file yourself; it is not included or downloaded by this demo. No frontend installation or build step is required.

Start the MCP server in one terminal:

```sh
cd ~/workspace/amazon-hackathon-alexa-mcp
npm start
```

Start the static UI server in another terminal:

```sh
cd ~/workspace/amazon-hackathon-alexa-mcp/sim-web
node serve.js
```

Open http://localhost:8080 in your browser. Optionally set `PORT` to change the UI port, for example `PORT=8081 node serve.js`.

The MCP server must accept browser requests from the UI origin through CORS, including the `MCP-Protocol-Version` and `Mcp-Session-Id` request headers. For session-based servers, expose `Mcp-Session-Id` in response headers. The UI sends initialization and the initialized notification before invoking tools, and supports JSON and SSE responses.

## Use

Click **Load sample** or paste a messy table, then click **Send**. Review the delimiter diagnostics and the first 12 cleaned rows. Click **Download .xlsx** to download all cleaned rows as `cleaned-table.xlsx`. Spreadsheet export requires the local SheetJS bundle. All application requests go to `http://localhost:3000/mcp`; no CDN is used.
