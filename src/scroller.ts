import eases from 'eases';
import { Container, ContainerChild, Sprite } from 'pixi.js';
import { Tween, TweenManager } from './Tweens';
import { tex } from './utils';

export class Scroller extends Container {
	spr: Sprite;

	constructor() {
		super();
		this.addEventListener('wheel', (event) => {
			if (this.tween) TweenManager.finish(this.tween);
			TweenManager.tween(
				this.pivot,
				'y',
				this.pivot.y + event.deltaY,
				100,
				undefined,
				eases.circOut
			);
		});
		this.spr = new Sprite(tex('white'));
		this.interactive = true;
	}

	addChild<U extends ContainerChild[]>(...children: U): U[0] {
		super.removeChild(this.spr);
		const r = super.addChild(...children);
		this.spr.width = this.width;
		this.spr.height = this.height;
		super.addChildAt(this.spr, 0);
		return r;
	}

	tween?: Tween;
}
