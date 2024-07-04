import { Sprite } from 'pixi.js';
import { sfx } from './Audio';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { tex } from './utils';

export class Btn extends GameObject {
	display: Display;

	constructor(public onClick: () => void, texture: string) {
		super();
		this.scripts.push((this.display = new Display(this)));

		const spr = new Sprite(tex(`${texture}_normal`));
		spr.label = 'button';
		this.display.container.addChild(spr);
		this.display.container.interactiveChildren = true;
		spr.anchor.x = spr.anchor.y = 0.5;
		spr.accessible = true;
		spr.accessibleHint = texture;
		spr.interactive = true;
		spr.eventMode = 'dynamic';
		spr.cursor = 'pointer';
		spr.tabIndex = 0;
		spr.on('pointerdown', onClick);
		spr.on('mouseover', () => {
			spr.texture = tex(`${texture}_over`);
		});
		spr.on('mousedown', () => {
			spr.texture = tex(`${texture}_down`);
			setTimeout(() => {
				spr.texture = tex(`${texture}_normal`);
			}, 100);
			sfx(texture, { rate: Math.random() * 0.2 + 0.9 });
		});
		spr.on('mouseout', () => {
			spr.texture = tex(`${texture}_normal`);
		});
	}
}
