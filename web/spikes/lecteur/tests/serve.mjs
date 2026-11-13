// Tiny static server for the browser checks. Mirrors web/_headers (cross-origin isolation for /spikes/*).
//   node tests/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..'); // web/
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

export function startServer(port = 0) {
	return new Promise((resolve) => {
		const srv = http.createServer((req, res) => {
			let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
			if (p.endsWith('/')) p += 'index.html';
			const file = path.join(root, p);
			if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
			const h = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' };
			if (p.startsWith('/spikes/')) { h['Cross-Origin-Opener-Policy'] = 'same-origin'; h['Cross-Origin-Embedder-Policy'] = 'require-corp'; }
			res.writeHead(200, h);
			fs.createReadStream(file).pipe(res);
		});
		srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, url: `http://127.0.0.1:${srv.address().port}` }));
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { port } = await startServer(+process.argv[2] || 8123);
	console.log(`http://127.0.0.1:${port}/spikes/lecteur/`);
}
