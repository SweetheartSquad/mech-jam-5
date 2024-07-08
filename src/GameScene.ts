import { BitmapText, Container } from 'pixi.js';
import { Area } from './Area';
import { Border } from './Border';
import { Btn } from './Btn';
import { Camera } from './Camera';
import { game, resource } from './Game';
import { GameObject } from './GameObject';
import { ScreenFilter } from './ScreenFilter';
import { Updater } from './Scripts/Updater';
import { StrandE } from './StrandE';
import { TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { V } from './VMath';
import { cellSize, size } from './config';
import { DEBUG } from './debug';
import { fontMechInfo } from './font';
import {
	displayToPlacementProps,
	flatten,
	forCells,
	replaceCells,
	rotateCellsByDisplay,
} from './layout';
import { error, warn } from './logger';
import { getInput, mouse } from './main';
import { makeModule, mechModuleParse, ModuleD } from './mech-module';
import { makePart, mechPartParse, MechD as PartD } from './mech-part';
import { Scroller } from './scroller';
import {
	buttonify,
	flipMatrixH,
	flipMatrixV,
	randItem,
	relativeMouse,
	removeFromArray,
	rotateMatrixClockwise,
} from './utils';

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
		this.containerUI.label = 'UI container';

		this.camera.display.container.addChild(this.container);
		this.camera.display.container.addChild(this.containerUI);

		this.strand.history.push('close');

		this.border.display.container.alpha = 0;
		this.strand.goto('start');

		const getPieces = (type: string) =>
			Object.keys(this.strand.passages).filter((i) => i.startsWith(`${type} `));

		const heads = getPieces('head');
		const arms = getPieces('arm');
		const legs = getPieces('leg');
		const chests = getPieces('chest');
		const modules = getPieces('module');
		this.pieces = {
			heads,
			arms,
			legs,
			chests,
			modules,
		};

		this.camera.display.container.interactiveChildren = true;
		this.camera.display.container.accessibleChildren = true;

		this.containerUI.addChild(this.mechinfo);
		this.mechinfo.x -= size.x / 2;
		this.mechinfo.y -= size.y / 2;
		this.mechinfo.x += 50;
		this.mechinfo.y += 50;
	}

	async start() {
		do {
			await this.scenePrebuild();
			await this.buildMech();
			await this.scenePrefight();
			await this.fight();
			await this.scenePostfight();
		} while (true);
	}

	waitForClose() {
		return new Promise<void>((r) => {
			const o = this.strand.renderer.displayPassage;
			this.strand.renderer.displayPassage = (passage) => {
				o(passage);
				if (passage.title === 'close') {
					this.strand.renderer.displayPassage = o;
					r();
				}
			};
		});
	}

	scenePrebuild() {
		this.strand.goto(`${this.strand.next} prebuild`);
		return this.waitForClose();
	}

	scenePrefight() {
		this.strand.goto(`${this.strand.next} prefight`);
		return this.waitForClose();
	}

	scenePostfight() {
		this.strand.goto(`${this.strand.next} postfight`);
		return this.waitForClose();
	}

	pieces: Record<'heads' | 'arms' | 'legs' | 'chests' | 'modules', string[]>;

	mechinfo = new BitmapText({ style: fontMechInfo });
	costMax = 1000;

	updateMechInfo() {
		let allCells = 0;
		forCells(this.mech.grid, () => {
			++allCells;
		});
		let freeCells = 0;
		forCells(this.modules.grid, (x, y, cell) => {
			if (cell === 'x') ++freeCells;
		});
		let cost = allCells * 1; // TODO: plus placed module costs
		cost += this.modules.placed.reduce((acc, i) => acc + i.module.cost, 0);
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
	modules!: ReturnType<GameScene['assembleModules']>;

	async buildMech(): Promise<void> {
		if (!this.mech) {
			await this.pickParts();
		}
		const done = await this.placeModules();
		if (!done) {
			this.modules = this.assembleModules([]);
			await this.pickParts();
			return this.buildMech();
		}
	}

	pickParts() {
		return new Promise<void>((donePickingParts) => {
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

			let head = this.mech
				? `head ${this.mech.headD.name}`
				: randItem(this.pieces.heads);
			let chest = this.mech
				? `chest ${this.mech.chestD.name}`
				: randItem(this.pieces.chests);
			let arm = this.mech
				? `arm ${this.mech.armLD.name}`
				: randItem(this.pieces.arms);
			let leg = this.mech
				? `leg ${this.mech.legLD.name}`
				: randItem(this.pieces.legs);

			this.reassemble();

			const headBtns = cycler(
				(newHead) => {
					head = newHead;
					this.mech.headD = this.getPart(newHead);
					this.reassemble();
				},
				this.pieces.heads,
				head
			);
			const chestBtns = cycler(
				(newChest) => {
					chest = newChest;
					this.mech.chestD = this.getPart(chest);
					this.reassemble();
				},
				this.pieces.chests,
				chest
			);
			const armBtns = cycler(
				(newArm) => {
					arm = newArm;
					this.mech.armLD = this.getPart(arm);
					this.mech.armRD = this.getPart(arm, true);
					this.reassemble();
				},
				this.pieces.arms,
				arm
			);
			const legBtns = cycler(
				(newLeg) => {
					leg = newLeg;
					this.mech.legLD = this.getPart(leg);
					this.mech.legRD = this.getPart(leg, true);
					this.reassemble();
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
				donePickingParts();
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
			headBtns.container.x += size.x / 4;
			chestBtns.container.x += size.x / 4;
			armBtns.container.x += size.x / 4;
			legBtns.container.x += size.x / 4;
			btnDone.transform.x += size.x / 4;
		});
	}

	placeModules() {
		return new Promise<boolean>((donePlacingModules) => {
			const modules = this.pieces.modules.map((i) => this.getModule(i));
			const modulesByName = modules.reduce<{
				[key: string]: (typeof modules)[number];
			}>((acc, i) => {
				acc[i.name] = i;
				return acc;
			}, {});

			let dragging: Container | null = null;
			let target: Btn | null = null;
			let valid = false;

			const onContext = (event: MouseEvent) => {
				if (!dragging) return;
				event.preventDefault();
				dragging.destroy();
				dragging = null;
				target = null;
				checkPlacement();
			};
			document.addEventListener('contextmenu', onContext);

			const gridBtns: Btn[] = [];
			const gridBtnsByPos: Btn[][] = [];

			const checkPlacement = () => {
				valid = false;
				gridBtns.forEach((i) => {
					i.spr.tint = 0xffffff;
				});
				if (!dragging) return;
				if (!target) return;
				valid = true;
				const [x, y] = target.spr.label.split(',').map((i) => Number(i));

				const moduleD = modulesByName[dragging.label];
				const draggingCells = rotateCellsByDisplay(moduleD.cells, dragging);

				const { turns } = displayToPlacementProps(dragging);
				const ox = Math.floor(moduleD.w / 2);
				const oy = Math.floor(moduleD.h / 2);
				const o = [ox, oy];
				if (turns % 2) o.reverse();
				forCells(draggingCells, (x2, y2) => {
					const modulecell = this.modules.grid[y + y2 - o[1]]?.[x + x2 - o[0]];
					if (modulecell !== 'x') valid = false;
				});

				forCells(draggingCells, (x2, y2) => {
					const btnNeighbour = gridBtnsByPos[y + y2 - o[1]]?.[x + x2 - o[0]];
					if (!btnNeighbour) return;
					btnNeighbour.spr.tint = valid ? 0x00ff00 : 0xff0000;
				});
			};

			const containerBtns = new Container();
			containerBtns.x =
				this.mech.container.x + (this.mech.gridDimensions.x + 0.5) * cellSize;
			containerBtns.y =
				this.mech.container.y + (this.mech.gridDimensions.y + 0.5) * cellSize;

			const startDragging = (moduleD: ModuleD) => {
				dragging = makeModule(moduleD);
				dragging.alpha = 0.5;
				this.containerUI.addChild(dragging);
				return dragging;
			};

			forCells(this.mech.grid, (x, y, cell) => {
				if (cell !== '0') return;
				const btn = new Btn((event) => {
					const copying = event.shiftKey || event.ctrlKey;
					if (!dragging) {
						// check for module
						const m = this.modules.grid[y][x];
						if (!m) return;
						const idx = parseInt(m, 10);
						let module: GameScene['modules']['placed'][number];
						if (copying) {
							// copy module
							module = this.modules.placed[idx];
						} else {
							// pick up module
							module = this.modules.placed.splice(idx, 1)[0];
						}
						this.reassemble();
						const newDrag = startDragging(module.module);
						newDrag.rotation = (module.turns / 4) * Math.PI * 2;
						newDrag.scale.x *= module.flipH ? -1 : 1;
						newDrag.scale.y *= module.flipV ? -1 : 1;
						target = btn;
						checkPlacement();
					} else if (valid && target && dragging) {
						// place selected module
						const moduleD = modulesByName[dragging.label];
						this.modules.placed.push({
							module: moduleD,
							x,
							y,
							...displayToPlacementProps(dragging),
						});
						if (!copying) {
							dragging.destroy();
							dragging = null;
							target = null;
						}
						this.reassemble();
						checkPlacement();
					}
				}, 'cell button');
				btn.spr.label = `${x},${y}`;
				btn.spr.addEventListener('pointerover', () => {
					target = btn;
					checkPlacement();
				});
				btn.spr.addEventListener('pointerout', () => {
					if (target !== btn) return;
					target = null;
					checkPlacement();
				});
				btn.transform.x = x * cellSize;
				btn.transform.y = y * cellSize;
				containerBtns.addChild(btn.display.container);
				gridBtnsByPos[y] = gridBtnsByPos[y] || [];
				gridBtnsByPos[y][x] = btn;
				gridBtns.push(btn);
			});

			const dragger = new Updater(this.camera, () => {
				if (!dragging) return;
				const input = getInput();
				const rm = relativeMouse();
				dragging.x = rm.x - size.x / 2;
				dragging.y = rm.y - size.y / 2;
				if (input.flipH) {
					dragging.scale.x *= -1;
					checkPlacement();
				}
				if (input.flipV) {
					dragging.scale.y *= -1;
					checkPlacement();
				}
				if (input.rotateR) {
					dragging.rotation += Math.PI / 2;
					dragging.rotation %= Math.PI * 2;
					checkPlacement();
				}
				if (input.rotateL) {
					dragging.rotation -= Math.PI / 2;
					if (dragging.rotation < 0) dragging.rotation += Math.PI * 2;
					checkPlacement();
				}
			});
			this.camera.scripts.push(dragger);

			const scroller = new Scroller({
				width: 200,
				height: size.y,
				gap: 10,
			});
			modules.forEach((moduleD) => {
				const uiModule = makeModule(moduleD);
				uiModule.x += uiModule.width / 2;
				uiModule.y += uiModule.height / 2;
				scroller.addChild(uiModule);
				buttonify(uiModule, moduleD.name);
				uiModule.addEventListener('pointerover', () => {
					// TODO: show module info
				});
				uiModule.addEventListener('pointerdown', (event) => {
					if (event && event.button !== mouse.LEFT) return;
					if (dragging) dragging.destroy();
					dragging = startDragging(moduleD);
				});
			});
			scroller.container.x = size.x / 2 - scroller.container.width;
			scroller.container.y -= size.y / 2;

			const destroy = () => {
				document.removeEventListener('contextmenu', onContext);
				removeFromArray(this.camera.scripts, dragger);
				btnDone.destroy();
				btnBack.destroy();
				scroller.destroy();
				gridBtns.forEach((i) => i.destroy());
			};
			const btnBack = new Btn(() => {
				if (this.modules.placed.length) {
					// TODO: proper ui
					if (!window.confirm('this will remove all modules, are you sure?'))
						return;
				}
				destroy();
				donePlacingModules(false);
			}, 'button');
			btnBack.display.container.addChild(
				new BitmapText({ text: 'back', style: fontMechInfo })
			);
			const btnDone = new Btn(() => {
				if (this.mechinfo.text.includes('!!!')) {
					// TODO: proper ui
					window.alert('too expensive!');
					return;
				}
				if (
					!this.modules.placed.some((i) => i.module.tags.includes('cockpit'))
				) {
					// TODO: proper ui
					window.alert('you have NO cockpit!');
					return;
				}
				destroy();
				donePlacingModules(true);
			}, 'button');
			btnDone.display.container.addChild(
				new BitmapText({ text: 'done', style: fontMechInfo })
			);
			this.container.addChild(containerBtns);
			this.containerUI.addChild(scroller.container);
			this.containerUI.addChild(btnDone.display.container);
			this.containerUI.addChild(btnBack.display.container);
			btnDone.transform.y -= btnDone.display.container.height;
			btnBack.transform.y -= btnBack.display.container.height;
			btnDone.transform.x += size.x / 4;
			btnBack.transform.x += size.x / 4 - btnBack.display.container.width;

			this.reassemble();
		});
	}

	reassemble() {
		let head = this.mech
			? `head ${this.mech.headD.name}`
			: randItem(this.pieces.heads);
		let chest = this.mech
			? `chest ${this.mech.chestD.name}`
			: randItem(this.pieces.chests);
		let arm = this.mech
			? `arm ${this.mech.armLD.name}`
			: randItem(this.pieces.arms);
		let leg = this.mech
			? `leg ${this.mech.legLD.name}`
			: randItem(this.pieces.legs);
		this.mech = this.assembleParts(head, chest, arm, leg);
		this.modules = this.assembleModules(this.modules?.placed || []);
		this.container.addChildAt(this.mech.container, 0);
		this.container.addChild(this.modules.container);
		this.mech.container.x -= Math.floor(size.x * (1 / 5));
		this.mech.container.y += size.y * 0.45;
		this.modules.container.x = this.mech.container.x;
		this.modules.container.y = this.mech.container.y;
		this.modules.container.x += this.mech.gridDimensions.x * cellSize;
		this.modules.container.y += this.mech.gridDimensions.y * cellSize;
		this.updateMechInfo();
	}

	getPart(key: string, flip?: boolean) {
		return mechPartParse(
			key.split(' ')[0],
			key,
			this.strand.getPassageWithTitle(key).body,
			flip
		);
	}

	getModule(key: string) {
		return mechModuleParse(key, this.strand.getPassageWithTitle(key).body);
	}

	assembleParts(
		headKey: string,
		chestKey: string,
		armKey: string,
		legKey: string
	): {
		container: Container;
		headD: PartD;
		chestD: PartD;
		armLD: PartD;
		armRD: PartD;
		legLD: PartD;
		legRD: PartD;
		grid: string[][];
		gridDimensions: {
			x: number;
			y: number;
			w: number;
			h: number;
		};
	} {
		this.mech?.container.destroy({ children: true });
		const container: Container = new Container();

		const headD = this.getPart(headKey);
		const chestD = this.getPart(chestKey);
		const legLD = this.getPart(legKey);
		const armLD = this.getPart(armKey);
		const legRD = this.getPart(legKey, true);
		const armRD = this.getPart(armKey, true);
		const [sprHead, cellsHead] = makePart(headD);
		const [sprChest, cellsChest] = makePart(chestD);
		const [sprArmR, cellsArmR] = makePart(armRD);
		const [sprArmL, cellsArmL] = makePart(armLD);
		const [sprLegR, cellsLegR] = makePart(legRD);
		const [sprLegL, cellsLegL] = makePart(legLD);
		const pairs = [
			[sprHead, cellsHead],
			[sprChest, cellsChest],
			[sprArmR, cellsArmR],
			[sprArmL, cellsArmL],
			[sprLegR, cellsLegR],
			[sprLegL, cellsLegL],
		];
		sprArmR.scale.x *= -1;
		sprLegR.scale.x *= -1;
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

		const [grid, gridDimensions] = flatten([
			{
				cells: chestD.cells,
				x: cellsChest.position.x / cellSize,
				y: cellsChest.position.y / cellSize,
			},
			{
				cells: headD.cells,
				x: cellsHead.position.x / cellSize,
				y: cellsHead.position.y / cellSize,
			},
			{
				cells: legLD.cells,
				x: cellsLegL.position.x / cellSize,
				y: cellsLegL.position.y / cellSize,
			},
			{
				cells: legRD.cells,
				x: cellsLegR.position.x / cellSize,
				y: cellsLegR.position.y / cellSize,
			},
			{
				cells: armLD.cells,
				x: cellsArmL.position.x / cellSize,
				y: cellsArmL.position.y / cellSize,
			},
			{
				cells: armRD.cells,
				x: cellsArmR.position.x / cellSize,
				y: cellsArmR.position.y / cellSize,
			},
		]);

		pairs.forEach(([spr, cells]) => {
			spr.x = cells.x + cells.width / 2;
			spr.y = cells.y + cells.height / 2;
		});

		container.y -= cellsChest.height + (cellsLegL.height - cellsLegL.y);

		return {
			container,
			headD,
			chestD,
			armLD,
			armRD,
			legLD,
			legRD,
			grid,
			gridDimensions,
		};
	}

	assembleModules(
		placed: {
			module: ModuleD;
			x: number;
			y: number;
			turns: number;
			flipH: boolean;
			flipV: boolean;
		}[]
	): {
		container: Container;
		placed: Parameters<GameScene['assembleModules']>[0];
		grid: string[][];
	} {
		this.modules?.container.destroy({ children: true });
		const container: Container = new Container();
		placed.forEach((i) => {
			const sprModule = makeModule(i.module);
			sprModule.rotation = (i.turns / 4) * Math.PI * 2;
			const o = [i.module.w % 2 ? 0.5 : 0, i.module.h % 2 ? 0.5 : 0];
			if (i.turns % 2) o.reverse();
			sprModule.x = (i.x + o[0]) * cellSize;
			sprModule.y = (i.y + o[1]) * cellSize;
			sprModule.scale.x = i.flipH ? -1 : 1;
			sprModule.scale.y = i.flipV ? -1 : 1;
			container.addChild(sprModule);
		});

		const [grid] = flatten([
			{
				cells: replaceCells(
					replaceCells(this.mech?.grid || [], /[^0]/, '-'),
					'0',
					'x'
				),
				x: 0,
				y: 0,
			},
			...placed.map((i, idx) => {
				let cells = i.module.cells;
				cells = rotateMatrixClockwise(cells, i.turns);
				if (i.flipH) cells = flipMatrixH(cells);
				if (i.flipV) cells = flipMatrixV(cells);
				cells = replaceCells(cells, '0', idx.toString(10));
				const ox = Math.floor(i.module.w / 2);
				const oy = Math.floor(i.module.h / 2);
				const o = [ox, oy];
				if (i.turns % 2) o.reverse();
				return {
					cells,
					x: i.x - o[0],
					y: i.y - o[1],
				};
			}),
		]);
		return {
			container,
			placed,
			grid,
		};
	}

	fight() {
		// TODO
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
