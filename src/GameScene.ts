import { BitmapText, Container } from 'pixi.js';
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
import { cellSize, size } from './config';
import { DEBUG } from './debug';
import { fontMechInfo } from './font';
import { error, warn } from './logger';
import { getInput } from './main';
import { makePiece, mechPieceParse } from './mech-piece';
import { randItem } from './utils';

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
		this.camera.display.container.accessibleChildren = true;

		this.containerUI.addChild(this.mechinfo);
		this.mechinfo.x -= size.x / 2;
		this.mechinfo.y -= size.y / 2;
		this.mechinfo.x += 50;
		this.mechinfo.y += 50;
		this.pickParts();
	}

	pieces: Record<'heads' | 'arms' | 'legs' | 'chests', string[]>;

	mechinfo = new BitmapText({ style: fontMechInfo });
	costMax = 1000;

	updateMechInfo() {
		const allCells = [
			this.mech.headD,
			this.mech.chestD,
			this.mech.armLD,
			this.mech.armRD,
			this.mech.legLD,
			this.mech.legRD,
		].reduce(
			(acc, i) =>
				acc +
				i.cells
					.join('')
					.replaceAll(',', '')
					.replaceAll(' ', '')
					.replaceAll('.', '').length,
			0
		);
		const freeCells = [
			this.mech.headD,
			this.mech.chestD,
			this.mech.armLD,
			this.mech.armRD,
			this.mech.legLD,
			this.mech.legRD,
		].reduce((acc, i) => acc + i.cells.join('').replace(/[^0]/g, '').length, 0); // TODO: minus placed modules
		const cost = allCells * 1; // TODO: plus placed module costs
		this.mechinfo.text = `
PRICE: ${cost.toString(10).padStart(this.costMax.toString(10).length, '0')}/${
			this.costMax
		} ${cost > this.costMax ? '!!!' : ''}
SPACE: ${freeCells
			.toString(10)
			.padStart(freeCells.toString(10).length, '0')}/${allCells}
`.trim();
	}

	mech!: ReturnType<GameScene['assembleParts']>;

	pickParts() {
		return new Promise<void>((r) => {
			const cycler = <T>(
				update: (item: T) => void,
				items: T[],
				selected: T = items[0]
			) => {
				let index = items.indexOf(selected);
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
				return { container, btnPrev, btnNext };
			};

			let head = randItem(this.pieces.heads);
			let chest = randItem(this.pieces.chests);
			let arm = randItem(this.pieces.arms);
			let leg = randItem(this.pieces.legs);
			this.mech = this.assembleParts(head, chest, arm, leg);

			const updateMech = () => {
				this.mech.container.destroy({ children: true });
				this.mech = this.assembleParts(head, chest, arm, leg);
				this.container.addChild(this.mech.container);
				this.updateMechInfo();
			};

			const headBtns = cycler(
				(newHead) => {
					head = newHead;
					updateMech();
				},
				this.pieces.heads,
				head
			);
			const chestBtns = cycler(
				(newChest) => {
					chest = newChest;
					updateMech();
				},
				this.pieces.chests,
				chest
			);
			const armBtns = cycler(
				(newArm) => {
					arm = newArm;
					updateMech();
				},
				this.pieces.arms,
				arm
			);
			const legBtns = cycler(
				(newLeg) => {
					leg = newLeg;
					updateMech();
				},
				this.pieces.legs,
				leg
			);
			const btnDone = new Btn(() => {
				[headBtns, chestBtns, armBtns, legBtns].forEach((i) => {
					i.btnPrev.destroy();
					i.btnNext.destroy();
					i.container.destroy({ children: true });
				});
				btnDone.destroy();
				r();
			}, 'button');
			this.containerUI.addChild(headBtns.container);
			this.containerUI.addChild(chestBtns.container);
			this.containerUI.addChild(armBtns.container);
			this.containerUI.addChild(legBtns.container);
			this.containerUI.addChild(btnDone.display.container);

			chestBtns.container.y += chestBtns.container.height;
			armBtns.container.y += chestBtns.container.height;
			armBtns.container.y += armBtns.container.height;
			legBtns.container.y += chestBtns.container.height;
			legBtns.container.y += armBtns.container.height;
			legBtns.container.y += legBtns.container.height;
			btnDone.transform.y -= btnDone.display.container.height;
		});
	}

	assembleParts(
		headKey: string,
		chestKey: string,
		armKey: string,
		legKey: string
	) {
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
