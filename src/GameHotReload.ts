import { game } from './Game';
import { DEBUG } from './debug';
import { log } from './logger';

export async function enableHotReload() {
	if (DEBUG) {
		if (import.meta.hot) {
			// hot reload assets manifest
			import.meta.hot.on('manifest-update', () => {
				log('[HACKY HMR] Reloading manifest');
				game.reloadManifest();
			});
			// hot reload assets
			import.meta.hot.on('assets-update', (asset) => {
				log('[HACKY HMR] Reloading asset', asset);
				game.reloadAsset(asset);
			});
		}
	}
}
