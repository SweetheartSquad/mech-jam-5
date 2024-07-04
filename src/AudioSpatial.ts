import { Howl } from 'howler';
import { getHowl, sfx } from './Audio';
import { size } from './config';
import { GameObject } from './GameObject';
import { error } from './logger';
import { getActiveScene } from './main';
import { Transform } from './Scripts/Transform';
import { clamp } from './utils';
import { distance } from './VMath';

export class AudioSpatial extends GameObject {
	transform: Transform;

	id: number;

	howl?: Howl;

	volume: number;

	refDistance: number;

	maxDistance: number;

	rolloffFactor: number;

	constructor({
		sfx: sfxName,
		x = 0,
		y = 0,
		rate,
		volume = 1,
		refDistance = 1,
		maxDistance = Math.max(size.x, size.y) / 2,
		rolloffFactor = 1,
	}: {
		sfx: string;
		x?: number;
		y?: number;
		rate?: number;
		volume?: number;
		refDistance?: number;
		maxDistance?: number;
		rolloffFactor?: number;
	}) {
		super();
		this.scripts.push((this.transform = new Transform(this)));
		this.transform.x = x;
		this.transform.y = y;
		this.refDistance = refDistance;
		this.maxDistance = maxDistance;
		this.rolloffFactor = rolloffFactor;
		this.volume = volume;
		this.howl = getHowl(sfxName);
		this.id = sfx(sfxName, { volume: 0, loop: true }) || 0;
		this.howl?.rate(rate || 1, this.id);
		this.init();
	}

	update() {
		super.update();
		const d = distance(
			getActiveScene()?.player.transform || { x: 0, y: 0 },
			this.transform
		);
		const dx = (getActiveScene()?.player.transform.x ?? 0) - this.transform.x;
		const k = Math.max(1, this.maxDistance - this.refDistance);
		const v = 1 - (this.rolloffFactor * (d - this.refDistance)) / k;
		const p =
			(this.rolloffFactor *
				Math.min(0, this.refDistance - Math.abs(dx)) *
				Math.sign(dx)) /
			k;

		try {
			this.howl?.volume(clamp(0, v, 1) * this.volume, this.id);
			this.howl?.stereo(clamp(-1, p, 1), this.id);
		} catch (err) {
			error(err);
		}
	}

	destroy() {
		this.howl?.stop(this.id);
		super.destroy();
	}

	pause() {
		super.pause();
		this.howl?.pause(this.id);
	}

	resume(): void {
		super.resume();
		this.howl?.play(this.id);
	}
}
