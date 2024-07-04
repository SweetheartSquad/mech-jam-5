import { GameObject } from '../GameObject';
import { Script } from './Script';

export class Updater extends Script {
	constructor(gameObject: GameObject, public cb: () => void) {
		super(gameObject);
	}

	update() {
		this.cb();
	}
}
