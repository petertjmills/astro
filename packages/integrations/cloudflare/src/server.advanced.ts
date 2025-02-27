import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { getProcessEnvProxy, isNode } from './util.js';
import mime from 'mime';

if (!isNode) {
	process.env = getProcessEnvProxy();
}

type Env = {
	ASSETS: { fetch: (req: Request) => Promise<Response> };
	name: string;
};

export function createExports(manifest: SSRManifest) {
	const app = new App(manifest);

	const fetch = async (request: Request, env: Env, context: any) => {
		process.env = env as any;

		const { pathname } = new URL(request.url);

		// static assets fallback, in case default _routes.json is not used
		if (manifest.assets.has(pathname)) {
			const content = await env.ASSETS.fetch(request);
			if (content.status == 404) {
				return new Response(null, {
					status: 404,
					statusText: 'Not found',
				});
			} else if (content.status != 200) {
				return new Response(null, {
					status: content.status,
					statusText: content.statusText,
				});
			}
			const body = content.body;
			const mimeType = mime.getType(pathname) || 'text/plain';
			const headers = new Headers(content.headers);
			headers.set('Content-Type', mimeType);
			return new Response(body, { headers });
		}

		let routeData = app.match(request, { matchNotFound: true });
		if (routeData) {
			Reflect.set(
				request,
				Symbol.for('astro.clientAddress'),
				request.headers.get('cf-connecting-ip')
			);
			Reflect.set(request, Symbol.for('runtime'), { env, name: 'cloudflare', ...context });
			let response = await app.render(request, routeData);

			if (app.setCookieHeaders) {
				for (const setCookieHeader of app.setCookieHeaders(response)) {
					response.headers.append('Set-Cookie', setCookieHeader);
				}
			}

			return response;
		}

		return new Response(null, {
			status: 404,
			statusText: 'Not found',
		});
	};

	return { default: { fetch } };
}
