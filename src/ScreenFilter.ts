import eases from 'eases';
import { Rectangle, Texture } from 'pixi.js';
import { CustomFilter } from './CustomFilter';
import { game, resource } from './Game';
import { Tween, TweenManager } from './Tweens';
import { size } from './config';
import { getActiveScene } from './main';
import { contrastDiff, reduceGrayscale } from './utils';

type Uniforms = {
	uWhiteout: number;
	uInvert: number;
	uNoise: number;
	uCurTime: number;
	uCamPos: [number, number];
	uFg: [number, number, number];
	uBg: [number, number, number];
	uDitherGridMap: Texture;
};

export class ScreenFilter extends CustomFilter<Uniforms> {
	constructor(uniforms?: Partial<Uniforms>) {
		const texDitherGrid = resource<Texture>('ditherGrid');
		if (!texDitherGrid) throw new Error('Could not find ditherGrid');
		texDitherGrid.source.addressMode = 'repeat';

		const frag = resource<string>('postprocess.frag') || '';
		super(frag, {
			uWhiteout: 0,
			uNoise: 0,
			uInvert: 0,
			uCurTime: 0,
			uCamPos: [0, 0],
			uFg: [0, 0, 0],
			uBg: [0, 0, 0],
			uDitherGridMap: texDitherGrid,
			...uniforms,
		});
		window.screenFilter = this;
		this.padding = 0;
		game.app.stage.filters = [this];
		game.app.stage.filterArea = new Rectangle(0, 0, size.x, size.y);
	}

	reload() {
		game.app.stage.filters = [];
		const n = new ScreenFilter({
			uWhiteout: this.uniforms.uWhiteout,
			uInvert: this.uniforms.uInvert,
			uCurTime: this.uniforms.uCurTime,
			uCamPos: this.uniforms.uCamPos,
			uFg: this.uniforms.uFg,
			uBg: this.uniforms.uBg,
		});
		window.screenFilter = n;
		game.app.stage.filters = [n];
		const scene = getActiveScene();
		if (scene?.screenFilter) scene.screenFilter = n;
		this.destroy();
	}

	palette(bg = this.uniforms.uBg, fg = this.uniforms.uFg) {
		this.uniforms.uBg = bg;
		this.uniforms.uFg = fg;
	}

	randomizePalette() {
		do {
			let fg = new Array(3)
				.fill(0)
				.map(() => Math.floor(Math.random() * 255)) as [number, number, number];
			let bg = new Array(3)
				.fill(0)
				.map(() => Math.floor(Math.random() * 255)) as [number, number, number];
			// reduce chance of darker fg than bg
			if (
				fg.reduce(reduceGrayscale, 0) < bg.reduce(reduceGrayscale, 0) &&
				Math.random() > 0.33
			) {
				[fg, bg] = [bg, fg];
			}
			this.palette(bg, fg);
		} while (contrastDiff(this.uniforms.uBg, this.uniforms.uFg) < 50);
	}

	paletteToString() {
		return JSON.stringify(
			[this.uniforms.uBg, this.uniforms.uFg].map((i) =>
				i.map((c) => Math.floor(c))
			)
		);
	}

	update() {
		document.body.style.backgroundColor = `rgb(${this.uniforms.uBg
			.map((i) => Math.floor(i))
			.join(',')})`;
	}

	tweenFlash: Tween[] = [];

	flash(
		colour: [number, number, number],
		duration: number,
		ease: (t: number) => number = eases.linear
	) {
		this.tweenFlash.forEach((i) => TweenManager.abort(i));
		this.tweenFlash.length = 0;
		this.tweenFlash = [
			TweenManager.tween(this.uniforms.uBg, 0, 0, duration, colour[0], ease),
			TweenManager.tween(this.uniforms.uBg, 1, 0, duration, colour[1], ease),
			TweenManager.tween(this.uniforms.uBg, 2, 0, duration, colour[2], ease),
		];
	}
}
