import eases from 'eases';
import {
	Container,
	ContainerChild,
	FederatedWheelEvent,
	NineSliceSprite,
	Sprite,
} from 'pixi.js';
import { sfx } from './Audio';
import { Spr9 } from './Spr9';
import { Tween, TweenManager } from './Tweens';
import { clamp, lerp, randRange, relativeMouse, tex } from './utils';

export class Scroller {
	container: Container;
	containerScroll: Container;
	sprBg: Sprite;
	sprMask: Sprite;
	scrollTop = 0;
	scrollHeight = 0;
	scrollGap: number;
	sprThumb: NineSliceSprite;

	tweens: Tween[] = [];

	enabled = true;

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
		this.scrollHeight += gap;

		this.container = new Container();
		this.containerScroll = new Container();
		this.sprMask = new Sprite(tex('white'));
		this.sprMask.width = width;
		this.sprMask.height = height;
		this.sprBg = new Sprite(tex('black'));
		this.containerScroll.mask = this.sprMask;
		this.container.addChild(this.containerScroll, this.sprMask);

		const sprTrack = new Spr9('scroll_track');
		this.sprThumb = new Spr9('scroll_thumb');
		this.container.addChild(sprTrack);
		sprTrack.addChild(this.sprThumb);
		sprTrack.height = height;
		sprTrack.x = width - sprTrack.width;

		sprTrack.interactive = true;
		sprTrack.addEventListener('click', (e) => {
			if (!this.enabled) return;
			const diff = e.globalY - this.scrollTop;
			const dir = Math.sign(diff);
			this.scrollBy(
				Math.max(Math.abs(diff) / 4, this.scrollHeight / 10) * dir,
				100
			);
		});
		this.sprThumb.cursor = 'grab';
		this.sprThumb.interactive = true;
		this.sprThumb.addEventListener('pointerdown', () => {
			if (!this.enabled) return;
			sprTrack.interactive = false;
			const scrollStart = this.scrollTop;
			const start = relativeMouse();
			const onMove = () => {
				const cur = relativeMouse();
				const diff = cur.y - start.y;
				this.scrollTo(scrollStart + diff);
			};

			document.addEventListener('pointermove', onMove);
			document.addEventListener(
				'pointerup',
				() => {
					sprTrack.interactive = true;
					document.removeEventListener('pointermove', onMove);
				},
				{ once: true }
			);
		});

		const onScroll = (event: FederatedWheelEvent) => {
			if (!this.enabled) return;
			this.scrollBy(event.deltaY, 100);
			event.preventDefault();
		};
		this.containerScroll.addEventListener('wheel', onScroll);
		sprTrack.addEventListener('wheel', onScroll);
		this.sprThumb.addEventListener('wheel', onScroll);
		this.containerScroll.interactive = true;
	}

	lastScroll = Date.now();
	scrollTo(y: number, duration = 0) {
		const now = Date.now();
		if (now - this.lastScroll > 50) {
			sfx('sfx_click1', { volume: 0.1, rate: randRange(1.1, 1.2) });
			this.lastScroll = now;
		}
		this.scrollTop = clamp(0, y, this.scrollHeight - this.sprMask.height);
		this.tweens.forEach((i) => TweenManager.abort(i));
		this.tweens.length = 0;
		const thumbY = lerp(
			0,
			this.sprMask.height - this.sprThumb.height,
			this.scrollTop / (this.scrollHeight - this.sprMask.height)
		);
		if (!duration) {
			this.containerScroll.pivot.y = this.scrollTop;
			this.sprThumb.y = thumbY;
		}
		this.tweens.push(
			TweenManager.tween(
				this.containerScroll.pivot,
				'y',
				this.scrollTop,
				duration,
				undefined,
				eases.circOut
			),
			TweenManager.tween(
				this.sprThumb,
				'y',
				thumbY,
				duration,
				undefined,
				eases.circOut
			)
		);
	}

	scrollBy(delta: number, duration?: number) {
		this.scrollTo(this.scrollTop + delta, duration);
	}

	addChild<U extends ContainerChild[]>(...children: U): U[0] {
		this.containerScroll.removeChild(this.sprBg);
		let r!: U[0];
		children.forEach((child) => {
			r = r || this.containerScroll.addChildAt(child, 0);
			child.y += this.scrollHeight;
			this.scrollHeight += child.height + this.scrollGap;
		});
		this.containerScroll.children.forEach((i) => {
			i.x = (this.sprMask.width - i.width) / 2;
		});
		this.sprBg.width = Math.max(this.containerScroll.width, this.sprMask.width);
		this.sprBg.height = Math.max(this.scrollHeight, this.sprMask.height);
		this.sprThumb.height =
			Math.max(1, this.scrollHeight / this.sprMask.height) *
			this.sprThumb.texture.height;

		this.containerScroll.addChildAt(this.sprBg, 0);
		return r;
	}

	destroy() {
		this.container.destroy({ children: true });
	}
}
