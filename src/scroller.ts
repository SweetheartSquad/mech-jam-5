import eases from 'eases';
import { Container, ContainerChild, Sprite } from 'pixi.js';
import { Tween, TweenManager } from './Tweens';
import { clamp, tex } from './utils';

export class Scroller {
	container: Container;
	containerScroll: Container;
	sprBg: Sprite;
	sprMask: Sprite;
	scrollTop = 0;
	scrollHeight = 0;
	scrollGap: number;

	constructor({
		width,
		height,
		gap = 0,
	}: {
		width: number;
		height: number;
		gap?: number;
	}) {
		this.scrollGap = gap;

		this.container = new Container();
		this.containerScroll = new Container();
		this.sprMask = new Sprite(tex('white'));
		this.sprMask.width = width;
		this.sprMask.height = height;
		this.sprBg = new Sprite(tex('blank'));
		this.containerScroll.mask = this.sprMask;
		this.container.addChild(this.containerScroll, this.sprMask);

		this.containerScroll.addEventListener('wheel', (event) => {
			this.scrollTop = clamp(
				0,
				this.scrollTop + event.deltaY,
				this.scrollHeight - height
			);
			if (this.tween) TweenManager.abort(this.tween);
			TweenManager.tween(
				this.containerScroll.pivot,
				'y',
				this.scrollTop,
				100,
				undefined,
				eases.circOut
			);
		});
		this.containerScroll.interactive = true;
	}

	addChild<U extends ContainerChild[]>(...children: U): U[0] {
		this.containerScroll.removeChild(this.sprBg);
		let r!: U[0];
		children.forEach((child) => {
			r = r || this.containerScroll.addChild(child);
			child.y += this.scrollHeight;
			this.scrollHeight += child.height + this.scrollGap;
		});
		this.sprBg.width = Math.max(this.containerScroll.width, this.sprMask.width);
		this.sprBg.height = Math.max(this.scrollHeight, this.sprMask.height);
		this.containerScroll.addChildAt(this.sprBg, 0);
		return r;
	}

	tween?: Tween;

	destroy() {
		this.container.destroy();
	}
}
