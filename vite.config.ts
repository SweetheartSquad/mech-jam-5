import { Plugin, defineConfig } from 'vite';
import pkg from './package.json';

const htmlReplaceTitlePlugin: Plugin = {
	name: 'transform-html',
	transformIndexHtml: {
		order: 'pre',
		handler(html: string) {
			return html.replace('<title>TITLE</title>', `<title>${pkg.description}</title>`);
		},
	},
};

const hotReloadAssetsPlugin: Plugin = {
	name: 'assets-hot-reload',
	handleHotUpdate({ file, server }) {
		if (file.endsWith('/public/assets.txt')) {
			server.ws.send({
				type: 'custom',
				event: 'manifest-update',
			});
			return [];
		}
		const match = file.match(/\/public(\/assets\/.*)$/);
		if (match) {
			server.ws.send({
				type: 'custom',
				event: 'assets-update',
				data: match[1],
			});
			return [];
		}
		server.ws.send({ type: 'full-reload' });
		return [];
	},
};

export default defineConfig({
	base: './',
	build: {
		assetsInlineLimit: Infinity,
	},
	server: {
		port: 80,
	},
	plugins: [htmlReplaceTitlePlugin, hotReloadAssetsPlugin],
	define: {
		BUILD_HASH: `"${Date.now()}"`,
	},
});
