import { Engine } from 'matter-js';
import { BitmapText } from 'pixi.js';
import { Game, resource, resources } from '../Game';
import { GameObject } from '../GameObject';
import { GameScene } from '../GameScene';
import { Player } from '../Player';
import { Resizer } from '../Resizer';
import { ScreenFilter } from '../ScreenFilter';

declare global {
	interface Window {
		// various globals for debugging, quick hacks, etc
		scene?: GameScene;
		debugPhysics?: boolean;
		text?: BitmapText;
		screenFilter?: ScreenFilter;
		engine?: Engine;
		gameObjects?: (typeof GameObject)['gameObjects'];
		game?: Game;
		player?: Player;
		resizer: Resizer;
		resources?: typeof resources;
		resource?: typeof resource;
	}

	type Maybe<T> = T | undefined;
}
