import { Container } from 'pixi.js';
import { Area } from './Area';
import { Border } from './Border';
import { Btn } from './Btn';
import { Camera } from './Camera';
import { game, resource } from './Game';
import { GameObject } from './GameObject';
import { ScreenFilter } from './ScreenFilter';
import { StrandE } from './StrandE';
import { TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { V } from './VMath';
import { cellSize } from './config';
import { DEBUG } from './debug';
import { error, warn } from './logger';
import { getInput } from './main';
import { makePiece, mechPieceParse } from './mech-piece';

export class GameScene {
	container = new Container();
	containerUI = new Container();

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
		this.camera.display.container.addChild(this.containerUI);

		this.strand.history.push('close');

		this.border.display.container.alpha = 0;
		this.strand.goto('start');

		const getPieces = (type: string) =>
			Object.keys(this.strand.passages).filter((i) => i.startsWith(type));

		const heads = getPieces('head');
		const arms = getPieces('arm');
		const legs = getPieces('leg');
		const chests = getPieces('chest');
		this.pieces = {
			heads,
			arms,
			legs,
			chests,
		};

		this.camera.display.container.interactiveChildren = true;

		this.pickParts();
	}

	pieces: Record<'heads' | 'arms' | 'legs' | 'chests', string[]>;

	async pickParts() {
		let head = '';
		let chest = '';
		let arm = '';
		let leg = '';

		const cycler = <T>(update: (item: T) => void, items: T[] = []) => {
			let index = 0;
			const btnPrev = new Btn(() => {
				--index;
				if (index < 0) index = items.length - 1;
				update(items[index]);
			}, 'buttonArrow');
			btnPrev.display.container.scale.x *= -1;
			const btnNext = new Btn(() => {
				++index;
				index %= items.length;
				update(items[index]);
			}, 'buttonArrow');
			const container = new Container();
			btnPrev.transform.x -= btnPrev.display.container.width / 2;
			btnNext.transform.x += btnNext.display.container.width / 2;
			container.addChild(btnPrev.display.container);
			container.addChild(btnNext.display.container);
			update(items[index]);
			return [container, btnPrev, btnNext] as const;
		};

		let mech = this.assembleParts('', '', '', '');
		const [containerHeadBtns] = cycler((newHead) => {
			head = newHead;
			if (mech) mech.container.destroy({ children: true });
			mech = this.assembleParts(head, chest, arm, leg);
			if (!mech) return;
			this.container.addChild(mech.container);
		}, this.pieces.heads);
		const [containerChestBtns] = cycler((newChest) => {
			chest = newChest;
			if (mech) mech.container.destroy({ children: true });
			mech = this.assembleParts(head, chest, arm, leg);
			if (!mech) return;
			this.container.addChild(mech.container);
		}, this.pieces.chests);
		const [containerArmBtns] = cycler((newArm) => {
			arm = newArm;
			if (mech) mech.container.destroy({ children: true });
			mech = this.assembleParts(head, chest, arm, leg);
			if (!mech) return;
			this.container.addChild(mech.container);
		}, this.pieces.arms);
		const [containerLegBtns] = cycler((newLeg) => {
			leg = newLeg;
			if (mech) mech.container.destroy({ children: true });
			mech = this.assembleParts(head, chest, arm, leg);
			if (!mech) return;
			this.container.addChild(mech.container);
		}, this.pieces.legs);
		this.containerUI.addChild(containerHeadBtns);
		this.containerUI.addChild(containerChestBtns);
		this.containerUI.addChild(containerArmBtns);
		this.containerUI.addChild(containerLegBtns);

		containerChestBtns.y += containerChestBtns.height;
		containerArmBtns.y += containerChestBtns.height;
		containerArmBtns.y += containerArmBtns.height;
		containerLegBtns.y += containerChestBtns.height;
		containerLegBtns.y += containerArmBtns.height;
		containerLegBtns.y += containerLegBtns.height;
	}

	assembleParts(
		headKey: string,
		chestKey: string,
		armKey: string,
		legKey: string
	) {
		if (!headKey || !chestKey || !armKey || !legKey) return;
		const container = new Container();
		const getPiece = (key: string, flip?: boolean) =>
			mechPieceParse(
				key.split(' ')[0],
				key,
				this.strand.getPassageWithTitle(key).body,
				flip
			);

		const headD = getPiece(headKey);
		const chestD = getPiece(chestKey);
		const legLD = getPiece(legKey);
		const armLD = getPiece(armKey);
		const legRD = getPiece(legKey, true);
		const armRD = getPiece(armKey, true);
		const [sprHead, cellsHead] = makePiece(headD);
		const [sprChest, cellsChest] = makePiece(chestD);
		const [sprArmR, cellsArmR] = makePiece(armRD);
		const [sprArmL, cellsArmL] = makePiece(armLD);
		const [sprLegR, cellsLegR] = makePiece(legRD);
		const [sprLegL, cellsLegL] = makePiece(legLD);
		const pairs = [
			[sprHead, cellsHead],
			[sprChest, cellsChest],
			[sprArmR, cellsArmR],
			[sprArmL, cellsArmL],
			[sprLegR, cellsLegR],
			[sprLegL, cellsLegL],
		];
		container.addChild(sprHead);
		container.addChild(sprChest);
		container.addChild(sprArmR);
		container.addChild(sprArmL);
		container.addChild(sprLegR);
		container.addChild(sprLegL);
		container.addChild(cellsHead);
		container.addChild(cellsChest);
		container.addChild(cellsArmR);
		container.addChild(cellsArmL);
		container.addChild(cellsLegR);
		container.addChild(cellsLegL);

		[cellsChest, cellsArmL, cellsArmR, cellsLegL, cellsLegR, cellsHead].forEach(
			(i) => {
				i.x -= cellsChest.width / 2;
				i.y -= cellsChest.height / 2;
			}
		);

		// connect head
		cellsHead.x -=
			(headD.connections.chest[0] - chestD.connections.head[0]) * cellSize;
		cellsHead.y -=
			(headD.connections.chest[1] - chestD.connections.head[1] + 1) * cellSize;

		// connect legL
		cellsLegL.x -=
			(legLD.connections.chest[0] - chestD.connections.legL[0]) * cellSize;
		cellsLegL.y -=
			(legLD.connections.chest[1] - chestD.connections.legL[1] - 1) * cellSize;

		// connect legR
		cellsLegR.x -=
			(legRD.connections.chest[0] - chestD.connections.legR[0]) * cellSize;
		cellsLegR.y -=
			(legRD.connections.chest[1] - chestD.connections.legR[1] - 1) * cellSize;

		// connect armL
		cellsArmL.x -=
			(armLD.connections.chest[0] - chestD.connections.armL[0] + 1) * cellSize;
		cellsArmL.y -=
			(armLD.connections.chest[1] - chestD.connections.armL[1]) * cellSize;

		// connect armR
		cellsArmR.x -=
			(armRD.connections.chest[0] - chestD.connections.armR[0] - 1) * cellSize;
		cellsArmR.y -=
			(armRD.connections.chest[1] - chestD.connections.armR[1]) * cellSize;

		pairs.forEach(([spr, cells]) => {
			spr.x = cells.x + cells.width / 2;
			spr.y = cells.y + cells.height / 2;
		});
		return { container, headD, chestD, armLD, armRD, legLD, legRD };
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
