import { Sprite, Texture, TilingSprite } from 'pixi.js';
import { game, getFrameCount, resource } from '../Game';
import { GameObject } from '../GameObject';
import { Script } from './Script';

export class Animator extends Script {
	spr: Sprite | TilingSprite;

	freq: number;

	offset = 0;

	frameCount!: number;

	private frames: number[] = [];

	frame!: number;

	animation!: string;

	holds: { [frame: number]: number } = {};

	active = true;

	frameChanged = false;

	constructor(
		gameObject: GameObject,
		{ spr, freq = 1 / 200 }: { spr: Sprite | TilingSprite; freq?: number }
	) {
		super(gameObject);
		this.spr = spr;
		this.freq = freq;
		this.setAnimation(spr.texture.label || '');
	}

	setAnimation(a: string, holds: { [frame: number]: number } = {}) {
		if (this.animation === a) return;
		const [animation, index] = a.split(/\.(\d+)$/);
		this.animation = animation;
		this.frameCount = getFrameCount(animation);
		this.frames = new Array(this.frameCount)
			.fill(0)
			.flatMap((_, idx) =>
				holds?.[idx + 1] !== undefined
					? new Array(holds[idx + 1]).fill(idx + 1)
					: idx + 1
			);
		this.frame = (this.frameCount ? parseInt(index, 10) - 1 : 0) || 0;
		this.offset = -game.app.ticker.lastTime;
		this.holds = holds;
		this.updateTexture();
	}

	updateTexture() {
		this.spr.texture =
			resource<Texture>(
				this.frameCount
					? `${this.animation}.${this.frames[this.frame]}`
					: this.animation
			) ||
			resource<Texture>('error') ||
			Texture.EMPTY;
	}

	update(): void {
		if (!this.frameCount || !this.active) return;
		const curTime = game.app.ticker.lastTime;
		const oldFrame = this.frame;
		this.frame =
			Math.floor(Math.abs(curTime + this.offset) * this.freq) %
			this.frames.length;
		this.frameChanged = this.frame !== oldFrame;
		this.updateTexture();
	}
}
