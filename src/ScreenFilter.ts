import eases from 'eases';
import { Rectangle, Texture } from 'pixi.js';
import { CustomFilter } from './CustomFilter';
import { game, resource } from './Game';
import { Tween, TweenManager } from './Tweens';
import { size } from './config';
import { getActiveScene } from './main';

type Uniforms = {
	uWhiteout: number;
	uInvert: number;
	uNoise: number;
	uCurTime: number;
	uCamPos: [number, number];
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
		});
		window.screenFilter = n;
		game.app.stage.filters = [n];
		const scene = getActiveScene();
		if (scene?.screenFilter) scene.screenFilter = n;
		this.destroy();
	}

	tweenFlash: Tween[] = [];

	flash(
		amt: number,
		duration: number,
		ease: (t: number) => number = eases.linear
	) {
		this.tweenFlash.forEach((i) => TweenManager.abort(i));
		this.tweenFlash.length = 0;
		this.tweenFlash = [
			TweenManager.tween(this.uniforms, 'uWhiteout', 0, duration, amt, ease),
		];
	}
}
