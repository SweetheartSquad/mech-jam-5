import eases from 'eases';
import {
	Container,
	ContainerChild,
	FederatedWheelEvent,
	NineSliceSprite,
	Sprite,
} from 'pixi.js';
import { Tween, TweenManager } from './Tweens';
import { clamp, lerp, relativeMouse, tex } from './utils';

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
		this.sprBg = new Sprite(tex('blank'));
		this.containerScroll.mask = this.sprMask;
		this.container.addChild(this.containerScroll, this.sprMask);

		const texTrack = tex('scroll_track');
		const sprTrack = new NineSliceSprite({
			texture: texTrack,
			leftWidth: texTrack.width / 3,
			topHeight: texTrack.height / 3,
			rightWidth: texTrack.width / 3,
			bottomHeight: texTrack.height / 3,
		});
		const texThumb = tex('scroll_thumb');
		this.sprThumb = new NineSliceSprite({
			texture: texThumb,
			leftWidth: texThumb.width / 3,
			topHeight: texThumb.height / 3,
			rightWidth: texThumb.width / 3,
			bottomHeight: texThumb.height / 3,
		});
		this.container.addChild(sprTrack);
		sprTrack.addChild(this.sprThumb);
		sprTrack.height = height;
		sprTrack.x = width - sprTrack.width;

		sprTrack.interactive = true;
		sprTrack.addEventListener('click', (e) => {
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
			this.scrollBy(event.deltaY, 100);
		};
		this.containerScroll.addEventListener('wheel', onScroll);
		sprTrack.addEventListener('wheel', onScroll);
		this.sprThumb.addEventListener('wheel', onScroll);
		this.containerScroll.interactive = true;
	}

	scrollTo(y: number, duration = 0) {
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
			r = r || this.containerScroll.addChild(child);
			child.y += this.scrollHeight;
			this.scrollHeight += child.height + this.scrollGap;
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
