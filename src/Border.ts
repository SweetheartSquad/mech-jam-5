import { game } from './Game';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { Spr9 } from './Spr9';
import { size } from './config';

export class Border extends GameObject {
	display: Display;

	constructor() {
		super();
		this.scripts.push((this.display = new Display(this)));
		const spr = new Spr9('border');
		spr.label = 'border';
		spr.width = size.x;
		spr.height = size.y;
		this.display.container.addChild(spr);
	}

	init(): void {
		super.init();
		game.app.stage.addChild(this.display.container);
	}

	destroy(): void {
		game.app.stage.removeChild(this.display.container);
		super.destroy();
	}
}
