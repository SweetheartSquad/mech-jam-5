import { NineSliceSprite } from 'pixi.js';
import { game } from './Game';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { size } from './config';
import { tex } from './utils';

export class Border extends GameObject {
	display: Display;

	constructor() {
		super();
		this.scripts.push((this.display = new Display(this)));
		const texBorder = tex('border');
		const spr = new NineSliceSprite({
			texture: texBorder,
			leftWidth: texBorder.width / 3,
			topHeight: texBorder.height / 3,
			rightWidth: texBorder.width / 3,
			bottomHeight: texBorder.height / 3,
		});
		spr.label = 'border';
		spr.width = size.x;
		spr.height = size.y;
		this.display.container.addChild(spr);
	}

	init(): void {
		super.init();
		game.app.stage.addChild(this.display.container);
	}

	destroy(): void {
		game.app.stage.removeChild(this.display.container);
		super.destroy();
	}
}
