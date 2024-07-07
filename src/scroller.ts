import eases from 'eases';
import { Container, ContainerChild, Sprite } from 'pixi.js';
import { Tween, TweenManager } from './Tweens';
import { clamp, tex } from './utils';

export class Scroller extends Container {
	spr: Sprite;
	scrollTop = 0;
	scrollHeight = 0;

	constructor(public scrollGap = 0) {
		super();
		this.addEventListener('wheel', (event) => {
			this.scrollTop = clamp(
				0,
				this.scrollTop + event.deltaY,
				this.scrollHeight
			);
			if (this.tween) TweenManager.abort(this.tween);
			TweenManager.tween(
				this.pivot,
				'y',
				this.scrollTop,
				100,
				undefined,
				eases.circOut
			);
		});
		this.spr = new Sprite(tex('white'));
		this.interactive = true;
	}

	addChild<U extends ContainerChild>(child: U): U {
		super.removeChild(this.spr);
		const r = super.addChild(child);
		this.spr.width = this.width;
		this.spr.height = this.height;
		child.y += this.scrollHeight;
		this.scrollHeight += child.height + this.scrollGap;
		super.addChildAt(this.spr, 0);
		return r;
	}

	tween?: Tween;
}
