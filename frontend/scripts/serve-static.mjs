import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 5180);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const relativePath = pathname === '/' ? 'static/index.html' : pathname.replace(/^\/+/, '');
  const target = normalize(join(root, relativePath));
  if (!target.startsWith(root)) { response.writeHead(403); response.end(); return; }
  try {
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/dist/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, '127.0.0.1');
