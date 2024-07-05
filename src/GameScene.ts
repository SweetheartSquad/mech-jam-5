import { Container, Graphics } from 'pixi.js';
import { Area } from './Area';
import { Border } from './Border';
import { Camera } from './Camera';
import { game, resource } from './Game';
import { GameObject } from './GameObject';
import { ScreenFilter } from './ScreenFilter';
import { StrandE } from './StrandE';
import { TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { V } from './VMath';
import { cellGap, cellSize } from './config';
import { DEBUG } from './debug';
import { error, warn } from './logger';
import { getInput } from './main';
import { makePiece, mechPieceParse } from './mech-piece';

function depthCompare(
	a: Container & { offset?: number },
	b: Container & { offset?: number }
): number {
	return a.y + (a.offset || 0) - (b.y + (b.offset || 0));
}

export class GameScene {
	container = new Container();

	graphics = new Graphics();

	camera = new Camera();

	dialogue: UIDialogue;

	screenFilter: ScreenFilter;

	strand: StrandE;

	border: Border;

	interactionFocus?: V;

	areas: Partial<{ [key: string]: GameObject[] }> & { root: GameObject[] } = {
		root: [],
	};

	area?: string;

	get currentArea() {
		return this.areas[this.area || ''];
	}

	find(name: string) {
		return this.currentArea?.find(
			(i) => (i as { name?: string }).name === name
		);
	}

	findAll(name: string) {
		return this.currentArea?.filter(
			(i) => (i as { name?: string }).name === name
		);
	}

	onCollisionStart: (e: Matter.IEventCollision<Matter.Engine>) => void;

	onCollisionEnd: (e: Matter.IEventCollision<Matter.Engine>) => void;

	focusAmt = 0.8;

	constructor() {
		this.strand = new StrandE({
			source:
				resource<string>('main-en') ||
				'::start\nNo "main-en.strand" found! [[close]]\n::close\nclose',
			logger: {
				log: (...args) => false,
				warn: (...args) => warn(...args),
				error: (...args) => error(...args),
			},
			renderer: {
				displayPassage: (passage) => {
					if (passage.title === 'close') {
						this.dialogue.close();
						return Promise.resolve();
					}
					const program = this.strand.execute(passage.program);
					if (this.strand.voice) {
						this.dialogue.voice = this.strand.voice;
						delete this.strand.voice;
					}
					const text: string[] = [];
					const actions: ((typeof program)[number] & {
						name: 'action';
					})['value'][] = [];
					program.forEach((node) => {
						switch (node.name) {
							case 'text':
								text.push(node.value);
								break;
							case 'action':
								actions.push(node.value);
								break;
							default:
								throw new Error('unrecognized node type');
						}
					});
					this.dialogue.say(
						text.join('').trim(),
						actions.map((i) => ({
							text: i.text,
							action: () => this.strand.eval(i.action),
						}))
					);
					return Promise.resolve();
				},
			},
		});
		this.strand.scene = this;
		this.strand.debug = DEBUG;
		this.dialogue = new UIDialogue(this.strand);

		this.border = new Border();
		this.border.init();

		this.take(this.dialogue);
		this.take(this.border);
		this.take(this.camera);

		this.screenFilter = new ScreenFilter();

		this.camera.display.container.addChild(this.container);

		this.strand.history.push('close');

		this.border.display.container.alpha = 0;
		this.strand.goto('start');

		const getPieces = (type: string) =>
			Object.keys(this.strand.passages)
				.filter((i) => i.startsWith(type))
				.map((i) =>
					mechPieceParse(type, i, this.strand.getPassageWithTitle(i).body)
				)
				.reduce<{
					[key: string]: ReturnType<typeof mechPieceParse>;
				}>((acc, i) => {
					acc[i.name] = i;
					return acc;
				}, {});

		const heads = getPieces('head');
		const arms = getPieces('arm');
		const legs = getPieces('leg');
		const chests = getPieces('chest');

		const headD = Object.values(heads)[1];
		const chestD = Object.values(chests)[1];
		const legD = Object.values(legs)[2];
		const armD = Object.values(arms)[2];
		const [sprHead, cellsHead] = makePiece(headD);
		const [sprChest, cellsChest] = makePiece(chestD);
		const [sprArmR, cellsArmR] = makePiece(armD);
		const [sprArmL, cellsArmL] = makePiece(armD);
		const [sprLegR, cellsLegR] = makePiece(legD);
		const [sprLegL, cellsLegL] = makePiece(legD);
		const pairs = [
			[sprHead, cellsHead],
			[sprChest, cellsChest],
			[sprArmR, cellsArmR],
			[sprArmL, cellsArmL],
			[sprLegR, cellsLegR],
			[sprLegL, cellsLegL],
		];
		this.container.addChild(sprHead);
		this.container.addChild(sprChest);
		this.container.addChild(sprArmR);
		this.container.addChild(sprArmL);
		this.container.addChild(sprLegR);
		this.container.addChild(sprLegL);
		this.container.addChild(cellsHead);
		this.container.addChild(cellsChest);
		this.container.addChild(cellsArmR);
		this.container.addChild(cellsArmL);
		this.container.addChild(cellsLegR);
		this.container.addChild(cellsLegL);
		sprLegR.scale.x *= -1;
		sprArmR.scale.x *= -1;

		sprHead.y -= ((headD.h + chestD.h) / 2) * (cellSize + cellGap);

		sprLegL.y += ((legD.h + chestD.h) / 2) * (cellSize + cellGap);
		sprLegR.y += ((legD.h + chestD.h) / 2) * (cellSize + cellGap);
		sprLegL.x -= ((legD.w + chestD.w) / 2) * (cellSize + cellGap);
		sprLegR.x += ((legD.w + chestD.w) / 2) * (cellSize + cellGap);

		sprArmL.x -= ((armD.w + chestD.w) / 2) * (cellSize + cellGap);
		sprArmR.x += ((armD.w + chestD.w) / 2) * (cellSize + cellGap);

		pairs.forEach(([spr, cells]) => {
			cells.scale.x = spr.scale.x;
			cells.position.x = spr.position.x;
			cells.position.y = spr.position.y;
		});
	}

	destroy(): void {
		Object.values(this.areas).forEach((a) => a?.forEach((o) => o.destroy()));
		this.container.destroy({
			children: true,
		});
		this.dialogue.destroy();
	}

	goto({ area = this.area }: { area?: string }) {
		this.gotoArea(area);
	}

	gotoArea(area?: string) {
		let a = this.currentArea;
		if (a) Area.unmount(a);
		this.area = area;
		a = this.currentArea;
		if (!a) throw new Error(`Area "${area}" does not exist`);
		Area.mount(a, this.container);
	}

	update(): void {
		if (DEBUG) {
			if (
				this.dialogue.isOpen &&
				this.strand.currentPassage.title === 'debug menu' &&
				getInput().menu
			) {
				this.strand.goto('close');
			} else if (getInput().menu) {
				this.strand.goto('debug menu');
			}
		}

		const curTime = game.app.ticker.lastTime;

		this.container.addChild(this.graphics);

		this.screenFilter.update();

		GameObject.update();
		TweenManager.update();
		this.screenFilter.uniforms.uCurTime = curTime / 1000;
		this.screenFilter.uniforms.uCamPos = [
			this.camera.display.container.pivot.x,
			-this.camera.display.container.pivot.y,
		];
	}

	take(gameObject: GameObject) {
		const a = this.currentArea;
		if (a) Area.remove(a, gameObject);
		Area.add(this.areas.root, gameObject);
	}

	drop(gameObject: GameObject) {
		Area.remove(this.areas.root, gameObject);
		const a = this.currentArea;
		if (a) Area.add(a, gameObject);
	}

	/**
	 * basic "localization" function (relying on strand passages as locale entries)
	 * @param key strand passage title
	 * @returns strand passage body for given key, or the key itself as a fallback
	 */
	t(key: string) {
		return this.strand.passages[key]?.body || key;
	}
}
