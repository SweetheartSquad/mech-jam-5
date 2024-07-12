import { FederatedPointerEvent, Sprite } from 'pixi.js';
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
	_enabled = true;

	constructor(
		public onClick: (event: FederatedPointerEvent) => void,
		public texture: string,
		title?: string
	) {
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

		const texs = [
			tex(`${texture}_normal`),
			tex(`${texture}_down`),
			tex(`${texture}_over`),
		];
		const [texNormal, texDown, texOver] = texs;

		let down = false;
		let inside = false;
		this.spr.on('pointerup', (event) => {
			if (!this._enabled) return;
			if (event && event.button !== mouse.LEFT) return;
			if (down) this.onClick(event);
		});
		this.spr.on('pointerover', () => {
			if (!this._enabled) return;
			inside = true;
			if (texs.includes(this.spr.texture))
				this.spr.texture = down ? texDown : texOver;
		});
		this.spr.on('pointerdown', (event) => {
			if (!this._enabled) return;
			if (event && event.button !== mouse.LEFT) return;
			down = true;
			if (texs.includes(this.spr.texture)) this.spr.texture = texDown;
			document.addEventListener(
				'pointerup',
				() => {
					down = false;
					if (texs.includes(this.spr.texture))
						this.spr.texture = inside ? texOver : texNormal;
				},
				{ once: true }
			);
			sfx(texture, { rate: Math.random() * 0.2 + 0.9 });
		});
		this.spr.on('pointerout', () => {
			if (!this._enabled) return;
			inside = false;
			if (texs.includes(this.spr.texture))
				this.spr.texture = down ? texOver : texNormal;
		});
		this.init();
	}

	public set enabled(v: boolean) {
		this._enabled = v;
		this.spr.cursor = v ? 'pointer' : 'auto';
	}
	public get enabled() {
		return this._enabled;
	}
}
