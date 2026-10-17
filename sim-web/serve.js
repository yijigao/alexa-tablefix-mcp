'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const realFile = await fs.promises.realpath(file);
    if (!realFile.startsWith(root + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const stat = await fs.promises.stat(realFile);
    if (!stat.isFile()) throw Object.assign(new Error('Not a file'), { code: 'ENOENT' });
    res.writeHead(200, { 'Content-Type': types[path.extname(realFile)] || 'application/octet-stream', 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(realFile);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'Not found' : 'Bad request');
  }
}).listen(port, () => console.log(`Simulation UI: http://localhost:${port}`));
