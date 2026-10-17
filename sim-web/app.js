'use strict';
const MCP_ENDPOINT = 'http://localhost:3000/mcp';
const PROTOCOL_VERSION = '2025-11-25';
const CONNECTION_ERROR = 'Cannot reach MCP server at http://localhost:3000/mcp — start it with: cd ~/workspace/amazon-hackathon-alexa-mcp && npm start';
const messages = document.querySelector('#messages');
const input = document.querySelector('#input');
const send = document.querySelector('#send');
let sessionId = null;
let initialized = false;
let nextId = 2;

function bubble(text, kind = 'assistant') {
  const element = document.createElement('article');
  element.className = `message ${kind}`;
  element.textContent = text;
  messages.append(element);
  element.scrollIntoView({ block: 'nearest' });
  return element;
}

async function rpc(payload) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': PROTOCOL_VERSION
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  let response;
  try {
    response = await fetch(MCP_ENDPOINT, {
      method: 'POST', headers, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    throw new Error(CONNECTION_ERROR);
  }
  if (!response.ok) {
    if (response.status === 404 || response.status === 410) {
      initialized = false;
      sessionId = null;
    }
    throw new Error(`MCP server returned HTTP ${response.status}. Please check the server and try again.`);
  }
  const returnedSession = response.headers.get('Mcp-Session-Id');
  if (returnedSession) sessionId = returnedSession;
  if (payload.id === undefined) {
    if (response.body) await response.body.cancel();
    return;
  }
  let message;
  if ((response.headers.get('Content-Type') || '').includes('text/event-stream')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!message) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const event = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const candidate = JSON.parse(data);
          if (candidate.id === payload.id) { message = candidate; break; }
        }
        if (done) break;
      }
    } finally {
      await reader.cancel();
    }
  } else {
    message = await response.json();
  }
  if (!message || message.id !== payload.id) throw new Error('MCP server did not return a matching response.');
  if (message.error) throw new Error(`MCP error: ${message.error.message}`);
  return message.result;
}

async function initialize() {
  if (initialized) return;
  await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'sim-web', version: '1.0.0' }
  } });
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  initialized = true;
}

async function callTool(name, args) {
  const result = await rpc({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args } });
  if (result?.isError) throw new Error(`The ${name} tool could not process this table.`);
  if (!result?.structuredContent) throw new Error(`The ${name} tool returned no structured content.`);
  return result.structuredContent;
}

function preview(rows) {
  if (!Array.isArray(rows) || !rows.every(Array.isArray)) throw new Error('The cleaning tool returned invalid table rows.');
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const element = bubble('', 'assistant preview');
  const caption = document.createElement('p');
  caption.textContent = `Cleaned table: ${rows.length} rows, ${columns} columns. Showing the first ${Math.min(12, rows.length)} rows.`;
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.setAttribute('aria-label', 'Cleaned table preview');
  for (const row of rows.slice(0, 12)) {
    const tr = table.insertRow();
    for (let col = 0; col < columns; col++) tr.insertCell().textContent = String(row[col] ?? '');
  }
  wrap.append(table);
  const download = document.createElement('button');
  download.textContent = 'Download .xlsx';
  download.type = 'button';
  download.addEventListener('click', () => {
    if (!window.XLSX) {
      bubble('Spreadsheet export is unavailable. Place the SheetJS Community Edition file at vendor/xlsx.full.min.js and reload this page.', 'assistant error');
      return;
    }
    try {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Cleaned table');
      const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cleaned-table.xlsx';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      bubble('Could not generate the spreadsheet. Please check the SheetJS file and try again.', 'assistant error');
    }
  });
  element.append(caption, wrap, download);
  element.scrollIntoView({ block: 'nearest' });
}

document.querySelector('#sample').addEventListener('click', () => {
  input.value = 'Name\tDepartment\tAmount\nAlice\tEngineering\t1200\nBob\tSales\t950\nCharlie\tOperations\t1100\nDana\tSupport\t800\textra';
  input.focus();
});

document.querySelector('#composer').addEventListener('submit', async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || send.disabled) return;
  bubble(text, 'user');
  input.value = '';
  send.disabled = true;
  const status = bubble('Analyzing your table…');
  try {
    await initialize();
    const detected = await callTool('detect_table', { text });
    const names = { '\t': 'TAB', tab: 'TAB', TAB: 'TAB', ',': 'COMMA', ';': 'SEMICOLON', '|': 'PIPE', ' ': 'SPACE' };
    const delimiter = names[detected.delimiter] || String(detected.delimiter ?? 'unknown');
    const columnCount = Array.isArray(detected.columns) ? detected.columns.length : detected.columns;
    status.textContent = `Detected delimiter: ${delimiter}, ${columnCount} columns, confidence: ${detected.confident ? 'high' : 'low'}, suspect rows: ${JSON.stringify(detected.suspectRows ?? [])}\nRow count: ${detected.rowCount ?? 'unknown'}\nDelimiter scores: ${JSON.stringify(detected.scores ?? {})}`;
    const cleaned = await callTool('clean_messy_text', { text, header: false });
    preview(cleaned.rows);
  } catch (error) {
    status.remove();
    bubble(error.message || 'An unexpected error occurred. Please try again.', 'assistant error');
  } finally {
    send.disabled = false;
    input.focus();
  }
});
