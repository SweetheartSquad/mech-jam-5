import { Character } from './Character';
import {
	BODY_ENVIRONMENT,
	BODY_PLAYER,
	SENSOR_INTERACTION,
	SENSOR_PLAYER,
} from './collision';
import { Roam } from './Scripts/Roam';
import * as VMath from './VMath';

export class NPC extends Character {
	name: string;

	roam: Roam;

	constructor({
		passage,
		focus,
		name,
		roam = 0,
		...options
	}: ConstructorParameters<typeof Character>[0] & {
		passage?: string;
		roam?: number;
		focus?: VMath.V;
		name?: string;
	}) {
		super({
			...options,
			bodyCollision: {
				...options.bodyCollision,
				collisionFilter: {
					category: BODY_ENVIRONMENT,
					mask: BODY_PLAYER | BODY_ENVIRONMENT,
				},
			},
			bodySensor: {
				...options.bodySensor,
				collisionFilter: {
					category: SENSOR_INTERACTION,
					mask: SENSOR_PLAYER,
				},
				plugin: {
					...options.bodySensor?.plugin,
					passage,
					focus,
				},
			},
		});
		this.scripts.push((this.roam = new Roam(this)));
		this.roam.range[1] = roam;
		this.roam.target.x = this.transform.x;
		this.roam.target.y = this.transform.y;
		this.roam.speed.x *= 0.004;
		this.roam.speed.y *= 0.004;

		this.name = name || options.body || '';
	}

	update(): void {
		this.moving.x = this.bodyCollision.body.velocity.x;
		this.moving.y = this.bodyCollision.body.velocity.y;
		super.update();
	}
}
