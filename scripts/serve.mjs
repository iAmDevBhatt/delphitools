// Minimal production static file server for the SPA build in `dist/`,
// used by the Docker image (see ../Dockerfile). Mirrors the SPA-fallback
// behaviour configured in wrangler.jsonc for the Cloudflare Workers
// deploy (`not_found_handling: "single-page-application"`): serve the
// exact file when it exists, fall back to a route's own index.html when
// the build was made with `build:static`, and otherwise fall back to
// the app shell so direct links into tool routes still work.
//
// Bun-specific (Bun.serve / Bun.file) — run with `bun scripts/serve.mjs`.

import { join, resolve, sep } from 'node:path';

const DIST = resolve(import.meta.dir, '..', 'dist');
const PORT = Number(process.env.PORT ?? 3000);

// Resolve a request path against DIST without letting it escape the
// directory (blocks `..` traversal).
function safeJoin(base, requestPath) {
	const resolved = resolve(base, `.${requestPath}`);
	if (resolved !== base && !resolved.startsWith(base + sep)) return null;
	return resolved;
}

async function fileOrNull(path) {
	if (!path) return null;
	const file = Bun.file(path);
	return (await file.exists()) ? file : null;
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const { pathname } = new URL(req.url);
		let decoded;
		try {
			decoded = decodeURIComponent(pathname);
		} catch {
			return new Response('Bad request', { status: 400 });
		}
		if (decoded.endsWith('/')) decoded += 'index.html';

		const exact = await fileOrNull(safeJoin(DIST, decoded));
		if (exact) return new Response(exact);

		// prerendered per-route index, e.g. /tools/foo -> /tools/foo/index.html
		const asIndex = await fileOrNull(
			safeJoin(DIST, `${decoded}/index.html`),
		);
		if (asIndex) return new Response(asIndex);

		// SPA fallback: let the app's client-side router handle it
		const shell = await fileOrNull(join(DIST, 'index.html'));
		if (shell) return new Response(shell);

		return new Response('Not found', { status: 404 });
	},
});

console.log(`delphitools listening on :${PORT}, serving ${DIST}`);
