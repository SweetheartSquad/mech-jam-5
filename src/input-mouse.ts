import { size } from './config';

// setup inputs
export class Mouse {
	LEFT = 0;

	MIDDLE = 1;

	RIGHT = 2;

	BACK = 3;

	FORWARD = 4;

	button: number;

	wheelY: number;

	wheelX: number;

	x: number;

	y: number;

	down: boolean;

	justDown: boolean;

	justUp: boolean;

	delta: {
		x: number;
		y: number;
	};

	prev: {
		x: number;
		y: number;
	};

	lock: boolean;

	element: HTMLElement;

	constructor(element: HTMLElement, lock: boolean) {
		this.button = 0;
		this.down = false;
		this.justDown = false;
		this.justUp = false;

		this.x = size.x / 2;
		this.y = size.y / 2;
		this.delta = {
			x: 0,
			y: 0,
		};
		this.prev = {
			x: 0,
			y: 0,
		};
		this.wheelY = 0;
		this.wheelX = 0;

		this.element = element;
		this.element.addEventListener('pointerup', this.onUp);
		this.element.addEventListener('pointerout', this.onUp);
		this.element.addEventListener('pointerdown', this.onDown);
		this.element.addEventListener('pointermove', this.onMove);
		this.element.addEventListener('wheel', this.onWheel);
		this.lock = !!lock;
		if (this.lock) {
			this.lockMouse();
		}
	}

	lockMouse(): void {
		this.element.requestPointerLock();
	}

	update(): void {
		this.justDown = false;
		this.justUp = false;

		this.wheelY = 0;
		this.wheelX = 0;

		// save old position
		this.prev.x = this.x;
		this.prev.y = this.y;
		// calculate delta position
		this.delta.x = 0;
		this.delta.y = 0;
	}

	onDown = (event: MouseEvent): void => {
		event.preventDefault();
		this.button = event.button > -1 ? event.button : this.button;
		if (!this.down) {
			this.down = true;
			this.justDown = true;
		}
		if (this.lock) {
			this.lockMouse();
		}
		this.onMove(event);
	};

	onUp = (event: MouseEvent): void => {
		this.button = event.button > -1 ? event.button : this.button;
		this.down = false;
		this.justDown = false;
		this.justUp = true;
		this.onMove(event);
	};

	onMove = (event: MouseEvent): void => {
		if (this.lock) {
			if (!document.hasFocus()) {
				return;
			}
			this.delta.x = event.movementX;
			this.delta.y = event.movementY;
			this.x += this.delta.x;
			this.y += this.delta.y;
			return;
		}
		// get new position
		this.x = event.clientX - this.element.offsetLeft;
		this.y = event.clientY - this.element.offsetTop;
		// calculate delta position
		this.delta.x = this.x - this.prev.x;
		this.delta.y = this.y - this.prev.y;
	};

	onWheel = (event: WheelEvent): void => {
		this.wheelY =
			event.deltaY ||
			(event as unknown as { originalEvent?: { wheelDelta?: number } })
				.originalEvent?.wheelDelta ||
			0;
		this.wheelX = event.deltaX;
		event.preventDefault();
	};

	isDown(): boolean {
		return this.down;
	}

	isUp(): boolean {
		return !this.isDown();
	}

	isJustDown(): boolean {
		return this.justDown;
	}

	isJustUp(): boolean {
		return this.justUp;
	}

	// returns -1 when moving down, 1 when moving up, 0 when not moving
	getWheelDir(): -1 | 1 | 0 {
		return Math.sign(this.wheelY) as -1 | 1 | 0;
	}
}
