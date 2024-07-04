import { game } from './Game';
import { GameObject } from './GameObject';
import { Poof } from './Poof';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';

export class Emitter extends GameObject {
	transform: Transform;

	lastSpawn = 0;

	rate: number | (() => number);

	spawn?: (poof: Poof) => void;

	initialProps: ConstructorParameters<typeof Poof>[0];

	tweens: Tween[] = [];

	constructor({
		x = 0,
		y = 0,
		rate = 0,
		spawn,
		...initialProps
	}: ConstructorParameters<typeof Poof>[0] & {
		x?: number;
		y?: number;
		rate?: number | (() => number);
		spawn?: (poof: Poof) => void;
	}) {
		super();
		this.rate = rate;
		this.spawn = spawn;
		this.initialProps = initialProps;
		this.scripts.push((this.transform = new Transform(this)));
		this.transform.x = x;
		this.transform.y = y;
		this.lastSpawn = game.app.ticker.lastTime;
		this.init();
	}

	destroy(): void {
		this.tweens.forEach((i) => TweenManager.abort(i));
		super.destroy();
	}

	update(): void {
		super.update();
		const t = game.app.ticker.lastTime;
		const maxPerFrame = 10;
		let count = 0;
		const rate = typeof this.rate === 'function' ? this.rate() : this.rate;
		while (t > this.lastSpawn + rate && ++count < maxPerFrame) {
			const p = new Poof(this.initialProps);
			p.transform.x += this.transform.x;
			p.transform.y += this.transform.y;
			this.spawn?.(p);
			this.lastSpawn += rate;
		}
	}
}
