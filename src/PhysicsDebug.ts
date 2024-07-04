import { Body, Composite } from 'matter-js';
import { Graphics, Sprite } from 'pixi.js';
import { game } from './Game';
import { GameObject } from './GameObject';
import { world } from './Physics';
import { Display } from './Scripts/Display';
import { partition } from './utils';

export class PhysicsDebug extends GameObject {
	graphics = new Graphics();

	graphicsStatic = new Graphics();
	sprStatic = new Sprite();

	lastStatic?: Body;

	display: Display;

	constructor() {
		super();
		this.scripts.push((this.display = new Display(this)));
		this.display.container.addChild(this.sprStatic);
		this.display.container.addChild(this.graphics);
	}

	update() {
		super.update();
		this.graphics.clear();
		if (window.debugPhysics) {
			const [staticBodies, rest] = partition(
				Composite.allBodies(world),
				(i) => i.isStatic && !i.plugin.interactive
			);
			if (this.lastStatic !== staticBodies[staticBodies.length - 1]) {
				this.lastStatic = staticBodies[staticBodies.length - 1];
				this.graphicsStatic.clear();
				staticBodies.forEach(this.debugDrawStatic);
				this.sprStatic.texture = game.app.renderer.generateTexture({
					target: this.graphicsStatic,
				});
				this.sprStatic.x = this.graphicsStatic.getBounds().x;
				this.sprStatic.y = this.graphicsStatic.getBounds().y;
				this.graphicsStatic.clear();
			}
			rest.forEach(this.debugDraw);
		}
	}

	debugDrawStatic = (body: Body): void => {
		const g = this.graphicsStatic;
		g.moveTo(
			body.vertices[body.vertices.length - 1].x,
			body.vertices[body.vertices.length - 1].y
		);
		body.vertices.forEach(({ x, y }) => g.lineTo(x, y));
		g.fill('rgba(153,153,153, 0.5)');
		g.stroke({ color: 'rgba(153,153,153, 0.5)', width: 1 });
	};

	debugDraw = (body: Body): void => {
		const g = this.graphics;

		g.moveTo(
			body.vertices[body.vertices.length - 1].x,
			body.vertices[body.vertices.length - 1].y
		);

		body.vertices.forEach(({ x, y }) => g.lineTo(x, y));
		if (body.isSensor) {
			g.fill('rgba(255,0,0, 0.1)');
		} else {
			g.fill('rgba(153,153,153, 0.2)');
		}
		g.stroke({ color: 'rgba(153,153,153, 0.5)', width: 1 });
	};
}
