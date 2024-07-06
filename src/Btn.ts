import { Sprite } from 'pixi.js';
import { sfx } from './Audio';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { tex } from './utils';

export class Btn extends GameObject {
	display: Display;
	transform: Transform;

	constructor(public onClick: () => void, texture: string) {
		super();
		this.scripts.push((this.transform = new Transform(this)));
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

		let down = false;
		spr.on('click', onClick);
		spr.on('pointerover', () => {
			spr.texture = tex(`${texture}_${down ? 'down' : 'over'}`);
		});
		spr.on('mousedown', () => {
			down = true;
			spr.texture = tex(`${texture}_down`);
			document.addEventListener(
				'pointerup',
				() => {
					down = false;
					spr.texture = tex(`${texture}_normal`);
				},
				{ once: true }
			);
			sfx(texture, { rate: Math.random() * 0.2 + 0.9 });
		});
		spr.on('pointerout', () => {
			spr.texture = tex(`${texture}_${down ? 'over' : 'normal'}`);
		});
		this.init();
	}
}
