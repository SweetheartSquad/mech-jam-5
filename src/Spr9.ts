import { NineSliceSprite } from 'pixi.js';
import { tex } from './utils';

export class Spr9 extends NineSliceSprite {
	constructor(key: string) {
		const texture = tex(key);
		super({
			texture: texture,
			leftWidth: texture.width / 3,
			topHeight: texture.height / 3,
			rightWidth: texture.width / 3,
			bottomHeight: texture.height / 3,
		});
	}
}
