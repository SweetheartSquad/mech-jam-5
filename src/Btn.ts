import { Sprite } from 'pixi.js';
import { sfx } from './Audio';
import { GameObject } from './GameObject';
import { mouse } from './main';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { tex } from './utils';

export class Btn extends GameObject {
	display: Display;
	transform: Transform;

	constructor(public onClick: () => void, texture: string, title?: string) {
		super();
		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));

		const spr = new Sprite(tex(`${texture}_normal`));
		spr.label = 'button';
		this.display.container.addChild(spr);
		this.display.container.interactiveChildren = true;
		this.display.container.accessibleChildren = true;
		spr.anchor.x = spr.anchor.y = 0.5;
		spr.accessible = true;
		spr.accessibleTitle = title;
		spr.accessibleHint = title || texture;
		spr.interactive = true;
		spr.eventMode = 'dynamic';
		spr.cursor = 'pointer';
		spr.tabIndex = 0;

		let down = false;
		spr.on('pointerup', (event) => {
			if (event && event.button !== mouse.LEFT) return;
			onClick();
		});
		spr.on('pointerover', () => {
			spr.texture = tex(`${texture}_${down ? 'down' : 'over'}`);
		});
		spr.on('pointerdown', (event) => {
			if (event && event.button !== mouse.LEFT) return;
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
