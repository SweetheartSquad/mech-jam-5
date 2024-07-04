import { Script } from './Script';
import { Transform } from './Transform';

export class AudioListener extends Script {
	transform?: Transform;

	init(): void {
		this.transform = this.gameObject.getScript(Transform);
	}

	update(): void {
		if (!this.transform) return;
		Howler.pos(this.transform.x, this.transform.y, 0);
	}

	// eslint-disable-next-line class-methods-use-this
	destroy(): void {
		Howler.pos();
	}
}
