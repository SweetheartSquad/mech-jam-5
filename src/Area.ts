import { Container } from 'pixi.js';
import { GameObject } from './GameObject';
import { Display } from './Scripts/Display';
import { removeFromArray } from './utils';

export class Area {
	static mount(area: GameObject[], container: Container) {
		area.forEach((i) => {
			i.getScripts(Display).forEach((d) => {
				container.addChild(d.container);
			});
			GameObject.gameObjects.push(i);
			i.resume();
		});
	}

	static unmount(area: GameObject[]) {
		area.forEach((i) => {
			i.getScripts(Display).forEach((d) => {
				d.container.parent?.removeChild(d.container);
			});
			removeFromArray(GameObject.gameObjects, i);
			i.pause();
		});
	}

	static add(area: GameObject[], ...objects: GameObject[]) {
		objects.forEach((object) => {
			this.remove(area, object);
			area.push(object);
		});
	}

	static remove(area: GameObject[], object: GameObject) {
		removeFromArray(area, object);
	}
}
