'use strict';

const express = require('express');
const cors = require('cors');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { detect } = require('./detect.js');

function jsonResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function createServer() {
  const server = new McpServer({ name: 'amazon-hackathon-alexa-mcp', version: '1.0.0' });

  server.registerTool('detect_table', {
    description: 'Detect a table delimiter, column count, confidence, delimiter scores and suspect rows.',
    inputSchema: { text: z.string().describe('Messy delimited text') },
  }, async ({ text }) => {
    const result = detect(text);
    return jsonResult({
      delimiter: result.delimiter,
      columns: result.columns,
      confident: result.confident ?? false,
      scores: result.scores ?? [],
      suspectRows: result.suspectRows,
      rowCount: result.lines.length,
    });
  });

  server.registerTool('clean_messy_text', {
    description: 'Split messy text into trimmed string cells using the best delimiter, even when confidence is low. Optionally remove the first row as a header.',
    inputSchema: {
      text: z.string().describe('Messy delimited text'),
      header: z.boolean().optional().describe('Remove the first non-empty row as a header; default false'),
    },
  }, async ({ text, header = false }) => {
    const result = detect(text);
    const offset = header && result.lines.length > 0 ? 1 : 0;
    const rows = (result.rows ?? []).slice(offset).map((row) => row.cells);
    return jsonResult({
      columns: result.columns,
      delimiter: result.delimiter,
      confident: result.confident ?? false,
      suspectRows: result.suspectRows.filter((index) => index >= offset).map((index) => index - offset),
      rowCount: rows.length,
      rows,
    });
  });

  return server;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Stateless transports and servers are created per request: no shared sessions.
async function handleMcp(req, res) {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    Promise.allSettled([transport.close(), server.close()]).catch(console.error);
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal server error' } });
    }
  }
}

app.post('/mcp', handleMcp);
app.get('/mcp', handleMcp);
app.delete('/mcp', handleMcp);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Alexa+ MCP server listening on port ${port}`));
