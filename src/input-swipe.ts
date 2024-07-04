import { DIRECTION_VERTICAL, Manager, Press, Swipe } from '@egjs/hammerjs';

class Swipes {
	x = 0;

	y = 0;

	press = false;

	constructor() {
		const manager = new Manager(document.body);
		manager.add(new Press());
		manager.add(
			new Swipe({
				threshold: 30,
				time: 300,
				direction: DIRECTION_VERTICAL,
			})
		);
		manager.on('press', () => {
			this.press = true;
		});
		manager.on('swipe', (e) => {
			this.x += e.deltaX;
			this.y += e.deltaY;
		});
	}

	update() {
		this.x = 0;
		this.y = 0;
		this.press = false;
	}

	isHorizontal() {
		return this.x && Math.abs(this.x) > Math.abs(this.y);
	}

	isVertical() {
		return this.y && Math.abs(this.y) > Math.abs(this.x);
	}

	isLeft() {
		return this.isHorizontal() && this.x < 0;
	}

	isRight() {
		return this.isHorizontal() && this.x > 0;
	}

	isUp() {
		return this.isVertical() && this.y < 0;
	}

	isDown() {
		return this.isVertical() && this.y > 0;
	}
}

export const swipes = new Swipes();
