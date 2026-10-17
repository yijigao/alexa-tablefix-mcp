'use strict';

// Real npm/start/curl verification. Run from this directory with npm run verify.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
process.chdir(__dirname);
fs.writeFileSync('verification.log', `Verification started: ${new Date().toISOString()}\n`);
function log(value) {
  fs.appendFileSync('verification.log', `${value}\n`);
  console.log(value);
}
function run(command, args) {
  log(`$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
  log((result.stdout || '') + (result.stderr || ''));
  log(`exit=${result.status}${result.error ? ` error=${result.error.message}` : ''}`);
  return result;
}
const install = run('npm', ['install', '--registry=https://registry.npmjs.org', '--cache=.npm-cache', '--fetch-retries=0', '--no-audit', '--no-fund']);
const copied = fs.readFileSync('detect.js');
const original = fs.readFileSync('/home/hatch/workspace/atypica-validation/build/messytext-to-excel/detect.js');
assert.ok(copied.equals(original));
log('PASS: detect.js is byte-for-byte identical to the source.');
run('node', ['--check', 'server.js']);
const output = fs.openSync('server.log', 'w');
log('$ npm start (background; output: server.log)');
const child = spawn('npm', ['start'], { detached: true, stdio: ['ignore', output, output] });
fs.closeSync(output);
fs.writeFileSync('server.pid', `${child.pid}\n`);
child.unref();
const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  await sleep(1000);
  log(fs.readFileSync('server.log', 'utf8'));
  const health = run('curl', ['--noproxy', '*', '-fsS', '--max-time', '5', `${base}/healthz`]);
  function rpc(payload) {
    const result = run('curl', ['--noproxy', '*', '-fsS', '--max-time', '10', `${base}/mcp`, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json, text/event-stream', '-H', 'MCP-Protocol-Version: 2025-11-25', '--data-binary', JSON.stringify(payload)]);
    if (install.status !== 0 || result.status !== 0) return null;
    const response = JSON.parse(result.stdout);
    assert.equal(response.jsonrpc, '2.0');
    assert.equal(response.error, undefined);
    return response;
  }
  const initialized = rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'curl-verifier', version: '1.0.0' } } });
  run('curl', ['--noproxy', '*', '-fsS', '--max-time', '10', `${base}/mcp`, '-H', 'Content-Type: application/json', '-H', 'Accept: application/json, text/event-stream', '-H', 'MCP-Protocol-Version: 2025-11-25', '--data-binary', JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })]);
  const listed = rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const detected = rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'detect_table', arguments: { text: 'name\tcity\tage\n Alice \tNew York, NY\t30\nBob\tParis\t28\nbroken\trow' } } });
  const cleaned = rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'clean_messy_text', arguments: { text: 'name,city,note\n Alice ,Paris,"hello, world"\nBob,London,"tab\there"\nbroken,row', header: true } } });
  if (install.status !== 0 || health.status !== 0) {
    fs.rmSync('server.pid', { force: true });
    log('FAIL: installation/startup/HTTP verification could not complete. See errors above; no successful MCP verification is claimed.');
    process.exitCode = 1;
    return;
  }
  assert.deepEqual(JSON.parse(health.stdout), { ok: true });
  assert.equal(initialized.result.protocolVersion, '2025-11-25');
  assert.deepEqual(listed.result.tools.map((tool) => tool.name).sort(), ['clean_messy_text', 'detect_table']);
  for (const response of [detected, cleaned]) {
    assert.ok(!response.result.isError);
    assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  }
  assert.equal(detected.result.structuredContent.delimiter, 'tab');
  assert.equal(cleaned.result.structuredContent.delimiter, 'comma');
  assert.equal(cleaned.result.structuredContent.rows[0][2], 'hello, world');
  assert.ok(cleaned.result.structuredContent.rows.every((row) => row.every((cell) => typeof cell === 'string')));
  const uncertain = rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'clean_messy_text', arguments: { text: 'first line\nsecond line' } } });
  assert.equal(uncertain.result.structuredContent.confident, false);
  assert.equal(uncertain.result.structuredContent.rows.length, 2);
  log(`PASS: npm install, background npm start (PID ${child.pid}), healthz, 2025-11-25 initialize, exactly 2 tools, both calls with valid JSON, and low-confidence fallback. Server remains running.`);
}
main().catch((error) => { log(`FAIL: ${error.stack}`); process.exitCode = 1; });
