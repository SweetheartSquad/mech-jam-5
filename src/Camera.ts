import { Container } from 'pixi.js';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import * as VMath from './VMath';
import { size } from './config';
import { randRange, zero } from './utils';

export class Camera extends GameObject {
	display: Display;

	private target?: Container;

	private targetPivot: VMath.V = { x: 0, y: 0 };

	subpixel = false;

	shake = 0;

	constructor() {
		super();
		this.scripts.push((this.display = new Display(this)));
		this.display.container.isRenderGroup = true;
		this.display.container.position.set(
			Math.floor(size.x / 2),
			Math.floor(size.y / 2)
		);
	}

	setTarget(newTarget: Container, updateTarget = true): void {
		this.target = newTarget;
		if (updateTarget) {
			this.updateTarget();
			VMath.copy(this.display.container.pivot, this.targetPivot);
		}
	}

	private updateTarget(): void {
		if (!this.target) {
			return;
		}
		const targetPoint = this.target.toLocal(zero, this.display.container);
		this.targetPivot = VMath.multiply(targetPoint, -1);
	}

	update(): void {
		super.update();
		this.updateTarget();

		VMath.copy(
			this.display.container.pivot,
			VMath.add(this.targetPivot, {
				x: randRange(-this.shake, this.shake),
				y: randRange(-this.shake, this.shake),
			})
		);
		if (!this.subpixel) {
			this.display.container.pivot.x = Math.round(
				this.display.container.pivot.x
			);
			this.display.container.pivot.y = Math.round(
				this.display.container.pivot.y
			);
		}
	}
}
