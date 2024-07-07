import { Sprite } from 'pixi.js';
import { sfx } from './Audio';
import { GameObject } from './GameObject';
import { mouse } from './main';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { buttonify, tex } from './utils';

export class Btn extends GameObject {
	spr: Sprite;
	display: Display;
	transform: Transform;

	constructor(public onClick: () => void, texture: string, title?: string) {
		super();
		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));

		this.spr = new Sprite(tex(`${texture}_normal`));
		this.spr.label = 'button';
		this.display.container.addChild(this.spr);
		this.display.container.interactiveChildren = true;
		this.display.container.accessibleChildren = true;
		this.spr.anchor.x = this.spr.anchor.y = 0.5;
		buttonify(this.spr, title || texture);

		let down = false;
		let inside = false;
		this.spr.on('pointerup', (event) => {
			if (event && event.button !== mouse.LEFT) return;
			if (down) onClick();
		});
		this.spr.on('pointerover', () => {
			inside = true;
			this.spr.texture = tex(`${texture}_${down ? 'down' : 'over'}`);
		});
		this.spr.on('pointerdown', (event) => {
			if (event && event.button !== mouse.LEFT) return;
			down = true;
			this.spr.texture = tex(`${texture}_down`);
			document.addEventListener(
				'pointerup',
				() => {
					down = false;
					this.spr.texture = tex(`${texture}_${inside ? 'over' : 'normal'}`);
				},
				{ once: true }
			);
			sfx(texture, { rate: Math.random() * 0.2 + 0.9 });
		});
		this.spr.on('pointerout', () => {
			inside = false;
			this.spr.texture = tex(`${texture}_${down ? 'over' : 'normal'}`);
		});
		this.init();
	}
}
