import Matter, { IChamferableBodyDefinition } from 'matter-js';
import { Sprite } from 'pixi.js';
import { game } from './Game';
import { GameObject } from './GameObject';
import { Animator } from './Scripts/Animator';
import { Body } from './Scripts/Body';
import { Display } from './Scripts/Display';
import { Roam } from './Scripts/Roam';
import { Transform } from './Scripts/Transform';
import { distance } from './VMath';
import { lerp, tex } from './utils';

const FLIP_EPSILON = 0.01;

let bounceOffset = 0;

export class Character extends GameObject {
	speed = 1;

	bodyCollision: Body;

	bodySensor: Body;

	body: string;

	rawScale: number;

	s: number;

	freq: number;

	bounceOffset: number;

	bounce: number;

	offset: number;

	flipped: boolean;

	shadow?: Sprite;

	spr: Sprite;

	animatorBody: Animator;

	running: boolean;

	moving: {
		x: number;
		y: number;
	};

	colliderSize: number;

	transform: Transform;

	display: Display;

	displayShadow: Display;

	animation: 'Idle' | 'Run';

	expression: string;

	constructor({
		body = 'guy',
		expression = '',
		x = 0,
		y = 0,
		scale = 1,
		bodyCollision,
		bodySensor: { radius, ...bodySensor } = {},
		shadow = true,
		freq = 1 / 200,
		colliderSize = 1,
		flip = false,
		tint = 0xffffff,
		offset = 0,
	}: {
		body?: string;
		expression?: string;
		x?: number;
		y?: number;
		scale?: number;
		bodyCollision?: Partial<IChamferableBodyDefinition>;
		bodySensor?: Partial<IChamferableBodyDefinition> & { radius?: number };
		shadow?: boolean;
		freq?: number;
		colliderSize?: number;
		outline?: boolean;
		flip?: boolean;
		tint?: number;
		offset?: number;
	}) {
		super();

		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		this.scripts.push((this.displayShadow = new Display(this)));

		this.expression = expression;
		this.body = body;
		this.rawScale = scale;
		this.s = 1.0;
		this.freq = freq;
		this.bounceOffset = ++bounceOffset;
		this.offset = offset;
		this.bounce = 1;
		this.running = false;
		this.flipped = flip;

		if (offset) {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore
			this.display.container.offset = offset;
		}

		if (shadow) {
			const s = (this.shadow = new Sprite(tex('shadows')));
			this.shadow.label = 'shadow';
			const sh = s.texture.height;
			s.anchor.x = 0.5;
			s.anchor.y = 0.5;

			// hack: offset shadows by their height so they don't overlap things
			s.position.y += sh;
			this.displayShadow.updatePosition = () => {
				Display.prototype.updatePosition.call(this.displayShadow);
				this.displayShadow.container.position.y -= sh;
			};
		} else {
			this.displayShadow.container.visible = false;
		}
		this.animation = 'Idle';
		this.spr = new Sprite(tex(`${body}Idle`));
		this.spr.label = `character ${body}`;
		this.spr.tint = tint;

		this.spr.anchor.x = 0.5;
		this.spr.anchor.y = 1.0;

		if (this.shadow) {
			this.displayShadow.container.addChild(this.shadow);
		}
		this.display.container.addChild(this.spr);
		this.spr.scale.x = this.spr.scale.y = this.rawScale;

		this.moving = { x: 0, y: 0 };

		// physics
		this.colliderSize = (this.spr.width / 4) * colliderSize;
		this.bodyCollision = new Body(
			this,
			{
				type: 'rectangle',
				width: this.colliderSize * 2,
				height: this.colliderSize,
			},
			{
				restitution: 0,
				friction: 0,
				frictionAir: 0.2,
				inertia: Infinity, // prevent rotation
				chamfer: { radius: this.colliderSize / 2, quality: 10 },
				...bodyCollision,
				position: { x, y },
			}
		);
		this.bodySensor = new Body(
			this,
			{
				type: 'circle',
				radius: radius || this.colliderSize * 2,
			},
			{
				restitution: 0,
				friction: 0,
				frictionAir: 0,
				inertia: Infinity,
				isSensor: true,
				density: 0.000000001,
				...bodySensor,
				plugin: {
					...bodySensor?.plugin,
					gameObject: this,
				},
			}
		);

		this.transform.x = this.bodyCollision.body.position.x;
		this.transform.y = this.bodyCollision.body.position.y;
		this.scripts.push(this.bodyCollision);
		this.scripts.push(this.bodySensor);
		this.scripts.push(
			(this.animatorBody = new Animator(this, { spr: this.spr, freq }))
		);
		this.animatorBody.offset = Math.random() * 10000;

		if (!body) {
			this.display.container.visible = false;
			this.displayShadow.container.visible = false;
		}

		this.init();
		this.update();
	}

	update(): void {
		if (
			Math.abs(this.bodyCollision.body.velocity.x) +
				Math.abs(this.bodyCollision.body.velocity.y) >
			((1 - Math.abs(this.moving.x) - Math.abs(this.moving.y)) * this.speed) / 2
		) {
			this.running = true;
		} else if (this.running) {
			this.running = false;
		}
		this.animatorBody.freq = this.freq / (this.running ? 0.5 : 1.0);
		if (this.running) {
			this.animation = 'Run';
			if (tex(`${this.body}Run`) !== tex('error')) {
				this.animatorBody.setAnimation(`${this.body}Run`);
			}
			if (Math.abs(this.moving.x) > FLIP_EPSILON) {
				this.flipped = this.moving.x < 0;
			}
		} else {
			this.spr.anchor.y = 1;

			if (
				this.expression &&
				tex(`${this.body}_${this.expression}`) !== tex('error')
			) {
				this.animatorBody.setAnimation(`${this.body}_${this.expression}`);
			} else {
				this.animation = 'Idle';
				this.animatorBody.setAnimation(`${this.body}Idle`);
			}
		}

		this.updateScale();
		this.updatePosition();
		super.update();
	}

	updateScale(): void {
		const curTime = game.app.ticker.lastTime * this.freq;
		this.s = lerp(this.s, 1, 0.3 * game.app.ticker.deltaTime);
		this.spr.scale.y =
			(this.s +
				(Math.sin(curTime + this.bounceOffset) / 50 +
					Math.abs(Math.sin(curTime + this.bounceOffset) / 30)) *
					this.bounce) *
			this.rawScale;
		this.spr.scale.x = (this.flipped ? -this.s : this.s) * this.rawScale;
		this.spr.skew.x = -this.bodyCollision.body.velocity.x / 50;

		if (this.shadow) {
			this.shadow.width =
				this.spr.width * 0.8 -
				((Math.sin(curTime + this.bounceOffset) / 30 +
					Math.abs(Math.sin(curTime + this.bounceOffset) / 10)) *
					this.spr.width) /
					2;
			this.shadow.height = this.spr.height * 0.15;
		}
	}

	updatePosition() {
		this.transform.x = this.bodyCollision.body.position.x;
		this.transform.y = this.bodyCollision.body.position.y;
		this.display.updatePosition();
		this.displayShadow.updatePosition();
		Matter.Body.setPosition(this.bodySensor.body, this.transform);
	}

	move(x: number, y: number) {
		this.setPosition(this.transform.x + x, this.transform.y + y);
	}

	async walkTo(x: number, y: number, targetRange = 5) {
		const roam = this.getScript(Roam);
		if (!roam) return;
		const { active, range } = roam;
		roam.active = true;
		roam.range = [0, 0];
		roam.target.x = x;
		roam.target.y = y;
		roam.offset.x = 0;
		roam.offset.y = 0;
		await new Promise<void>((r) => {
			const onUpdate = () => {
				if (distance(roam.target, this.transform) > targetRange) return;
				game.app.ticker.remove(onUpdate);
				r();
			};
			game.app.ticker.add(onUpdate);
		});
		roam.active = active;
		roam.range = range;
	}

	walkBy(x = 0, y = 0, targetRange?: number) {
		return this.walkTo(this.transform.x + x, this.transform.y + y, targetRange);
	}

	setPosition(x: number, y: number) {
		this.bodyCollision.setPosition(x, y);
		this.updatePosition();
	}

	get x() {
		return this.transform.x;
	}

	set x(value: number) {
		this.setPosition(value, this.transform.y);
	}

	get y() {
		return this.transform.y;
	}

	set y(value: number) {
		this.setPosition(this.transform.x, value);
	}
}
