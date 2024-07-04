import { BitmapText } from 'pixi.js';
import { Game, resource, resources } from '../Game';
import { GameObject } from '../GameObject';
import { GameScene } from '../GameScene';
import { Resizer } from '../Resizer';
import { ScreenFilter } from '../ScreenFilter';

declare global {
	interface Window {
		// various globals for debugging, quick hacks, etc
		scene?: GameScene;
		text?: BitmapText;
		screenFilter?: ScreenFilter;
		gameObjects?: (typeof GameObject)['gameObjects'];
		game?: Game;
		resizer: Resizer;
		resources?: typeof resources;
		resource?: typeof resource;
	}

	type Maybe<T> = T | undefined;
}
