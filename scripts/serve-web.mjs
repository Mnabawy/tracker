// Serves a static web export (`npx expo export -p web`) for local layout checks.
// expo-sqlite's web worker needs SharedArrayBuffer, which browsers only allow on
// cross-origin-isolated pages, hence the COOP/COEP headers.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] ?? 'dist';
const port = Number(process.argv[3] ?? 8082);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
