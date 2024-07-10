import 'pixi.js/text-bitmap';
// import text-bitmap before rest of pixi
import HowlerLoaderParser from 'howler-pixi-loader-middleware';
import {
	AbstractRenderer,
	Application,
	Assets,
	BitmapFont,
	BitmapText,
	Container,
	NineSliceSprite,
	ProgressCallback,
	Sprite,
	Text,
	Texture,
	TextureSource,
	extensions,
	loadTxt,
	path,
} from 'pixi.js';
import { getMusic, music } from './Audio';
import { enableHotReload } from './GameHotReload';
import { Animator } from './Scripts/Animator';
import { Display } from './Scripts/Display';
import { size } from './config';
import * as fonts from './font';
import { error } from './logger';
import { getActiveScene, init } from './main';
import { firstCoalesce, tex, unique } from './utils';
// eslint-disable-next-line import/extensions, import/no-absolute-path
import assets from '/assets.txt?url';

// PIXI configuration stuff
TextureSource.defaultOptions.scaleMode = 'nearest';
AbstractRenderer.defaultOptions.roundPixels = true;

function cacheBust(url: string) {
	if (url.startsWith('data:') || url.startsWith('http')) return url;
	const urlObj = new URL(url, window.location.href);
	urlObj.searchParams.set('t', BUILD_HASH || '');
	return urlObj.toString();
}

const frameCounts: Record<string, number> = {};
export const resources: Record<string, unknown> = {};

export function resource<T>(key: string) {
	return resources[key] as T | undefined;
}

export function getFrameCount(animation: string): number {
	return frameCounts[animation] || 0;
}

window.resources = resources;
window.resource = resource;

function getAssetName(file: string) {
	return file.split('/').pop()?.split('.').slice(0, -1).join('.') || file;
}

function updateResourceCache(assetsLoaded: Record<string, unknown>) {
	// update public cache
	Object.keys(assetsLoaded).forEach((i) => delete resources[i]);
	Object.entries(assetsLoaded).forEach(([key, value]) => {
		resources[key] = value;
		const texture = value as Texture;
		if (texture?.label) {
			texture.label = key;
		}
	});

	unique(
		Object.keys(assetsLoaded)
			.filter((i) => i.match(/\.\d+$/))
			.map((i) => i.replace(/\.\d+$/, ''))
	).forEach((i) => {
		// cache frame sequence data
		frameCounts[i] = Object.keys(resources).filter((j) =>
			j.startsWith(`${i}.`)
		).length;

		// cache alias to first frame under non-numbered key
		resources[i] = resources[`${i}.1`];
	});
}

export async function loadAssetResources() {
	if (Object.keys(resources).length) {
		await Assets.unload(cacheBust(assets));
	}
	const assetsData = (await Assets.load<string>(cacheBust(assets))) as string;
	const assetResources = assetsData
		.trim()
		.split(/\r?\n/)
		.flatMap((i) => {
			if (i.match(/\.x\d+\./)) {
				const [base, count, ext] = i.split(/\.x(\d+)\./);
				return new Array(parseInt(count, 10))
					.fill('')
					.map((_, idx) => `${base}.${idx + 1}.${ext}`);
			}
			return i;
		})
		.filter((i) => i && !i.startsWith('//'))
		.reduce<Record<string, string>>((acc, i) => {
			const name = getAssetName(i);
			const url = i.startsWith('http') ? i : `assets/${i}`;
			if (acc[name])
				throw new Error(`Asset name conflict: "${acc[name]}", "${url}"`);
			acc[name] = cacheBust(url);
			return acc;
		}, {});
	return assetResources;
}

export class Game {
	app: Application;

	startTime = 0;

	constructor() {
		this.app = new Application();
	}

	async init() {
		const canvas = document.createElement('canvas');
		await this.app.init({
			canvas,
			width: size.x,
			height: size.y,
			antialias: false,
			backgroundAlpha: 1,
			resolution: 1,
			clearBeforeRender: true,
			backgroundColor: 0x000000,
			preference: 'webgl', // TODO: remove when compatible with webgpu
		});

		// preload fonts
		Object.values(fonts).forEach((i) => {
			const t =
				resource<BitmapFont>(firstCoalesce(i.fontFamily || ''))?.constructor
					.name === 'BitmapFont'
					? new BitmapText({ text: 'preload', style: i })
					: new Text({ text: 'preload', style: i });
			t.alpha = 0;
			this.app.stage.addChild(t);
			this.app.render();
			this.app.stage.removeChild(t);
		});
		init();
		this.startTime = Date.now();
	}

	// eslint-disable-next-line class-methods-use-this
	async load(onLoad?: ProgressCallback) {
		Assets.init();

		// parse .strand and .glsl as plaintext
		const loadTextTest = loadTxt.test;
		loadTxt.test = (url) =>
			loadTextTest?.(url) ||
			path.extname(url).includes('.strand') ||
			path.extname(url).includes('.glsl');
		extensions.add(HowlerLoaderParser);

		// load assets list
		const assetResources = await loadAssetResources();

		// load assets
		Assets.addBundle('resources', assetResources);
		const assetsLoaded = await Assets.loadBundle('resources', onLoad);

		// verify assets loaded
		const failedToLoad = Object.keys(assetResources)
			.filter((i) => !assetsLoaded[i])
			.join(', ');
		if (failedToLoad) throw new Error(`Failed to load: ${failedToLoad}`);

		updateResourceCache(assetsLoaded);
	}

	private async reloadAssetRaw(asset: string) {
		this.app.ticker.stop();

		function recurseChildren(result: Container[], obj: Container): Container[] {
			result = result.concat(obj);
			if (!(obj instanceof Container)) return result;
			return result.concat(
				...(obj as Container).children.map((i) => recurseChildren([], i))
			);
		}

		const scene = getActiveScene();
		const assetName = getAssetName(asset);
		const oldAsset = resource(assetName);
		let unload: (() => Promise<void>) | undefined;
		let reload: (() => Promise<void>) | undefined;

		const isTexture = !!(oldAsset as Texture)?.source;
		if (isTexture) {
			type Textured = Sprite | NineSliceSprite;
			let textures: Textured[];
			unload = async () => {
				const objs = recurseChildren([], this.app.stage).concat(
					...Object.values(scene?.areas || [])
						.flat()
						.flatMap((i) => i?.getScripts(Display))
						.filter((i) => i)
						.map((i) => recurseChildren([], (i as Display).container))
				);
				textures = objs.filter(
					(i) => (i as Textured)?.texture === oldAsset
				) as Textured[] as Textured[];
			};
			reload = async () => {
				textures.forEach((textured) => {
					textured.texture = tex(assetName);
				});
			};
		}
		const playing = getMusic();
		if (playing?.howl && (oldAsset as Howl) === playing.howl) {
			unload = async () => {
				music('', { fade: 0, restart: true });
			};
			reload = async () => {
				music(playing.music, { ...playing, fade: 0, restart: true });
			};
		}
		if (scene && asset.includes('.strand')) {
			unload = async () => {
				scene.strand.history.push(scene.strand.currentPassage.title);
			};
			reload = async () => {
				scene.strand.setSource(
					resource<string>(`main-${scene.strand.language || 'en'}`) || ''
				);
				if (scene.strand.currentPassage?.title) {
					await new Promise<void>((r) => {
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								if (!scene) return;
								scene.strand.back();
								r();
							});
						});
					});
				}
			};
		}

		await unload?.();
		if (resources[assetName]) await Assets.unload(assetName);
		const newAsset = await Assets.load({
			name: assetName,
			src: `${asset}?t=${Date.now()}`,
		}).catch((err) => {
			if (isTexture) {
				error(err);
				return tex('error');
			}
			throw err;
		});
		updateResourceCache({
			[assetName]: newAsset,
		});
		await reload?.();

		scene?.screenFilter.reload();

		this.app.ticker.start();
	}

	private async reloadManifestRaw() {
		this.app.ticker.stop();

		const oldAssets = Object.keys(resources);
		const updatedAssets = await loadAssetResources();
		const newAssets = Object.keys(updatedAssets)
			.filter((i) => !oldAssets.includes(i))
			.map((i) => updatedAssets[i]);
		const deletedAssets = oldAssets.filter((i) => !updatedAssets[i]);
		deletedAssets.map((i) => delete resources[i]);
		await Promise.all(newAssets.map((i) => window.game?.reloadAssetRaw(i)));

		updateResourceCache(
			Object.fromEntries(
				await Promise.all(
					Object.entries(updatedAssets).map(async ([k, v]) => [
						k,
						await Assets.load(v),
					])
				)
			)
		);

		window.gameObjects?.forEach((i) => {
			i.getScripts(Animator).forEach((animator) => {
				const a = animator.animation;
				animator.animation = '';
				animator.setAnimation(a, animator.holds);
			});
		});

		this.app.ticker.start();
	}

	private reloadingAssets = Promise.resolve();

	async reloadAsset(asset: string) {
		this.reloadingAssets = this.reloadingAssets.then(() =>
			this.reloadAssetRaw(asset)
		);
		return this.reloadingAssets;
	}

	async reloadManifest() {
		this.reloadingAssets = this.reloadingAssets.then(() =>
			this.reloadManifestRaw()
		);
		return this.reloadingAssets;
	}
}

export const game = new Game();
window.game = game;

enableHotReload();
