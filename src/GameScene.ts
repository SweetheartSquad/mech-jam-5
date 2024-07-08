import { BitmapText, Container, Sprite } from 'pixi.js';
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
	copyCells,
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
	delay,
	flipMatrixH,
	flipMatrixV,
	formatCount,
	randItem,
	relativeMouse,
	removeFromArray,
	rotateMatrixClockwise,
	tex,
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
		await this.scenePrebuild();
		this.mech = this.assembleParts(
			randItem(this.pieces.heads),
			randItem(this.pieces.chests),
			randItem(this.pieces.arms),
			randItem(this.pieces.legs)
		);
		this.modules = this.assembleModules([]);
		this.mechEnemy = this.assembleParts(
			randItem(this.pieces.heads),
			randItem(this.pieces.chests),
			randItem(this.pieces.arms),
			randItem(this.pieces.legs)
		);
		this.modulesEnemy = this.assembleModules([]);
		await this.pickParts();
		await this.buildMech();
		await this.scenePrefight();
		await this.fight();
		await this.scenePostfight();
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

	modal(opacity = 0.25) {
		const spr = new Sprite(tex('black'));
		spr.width = size.x * 2;
		spr.height = size.y * 2;
		spr.anchor.x = spr.anchor.y = 0.5;
		spr.alpha = opacity;
		spr.interactive = true;
		this.containerUI.addChild(spr);
		return () => {
			spr.destroy();
		};
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
		const cost =
			allCells * 1 +
			this.modules.placed.reduce((acc, i) => acc + i.module.cost, 0);
		this.mechinfo.text = `
PRICE: ${formatCount(cost, this.costMax)}
SPACE: ${formatCount(freeCells, allCells)}
`.trim();
	}

	mech!: ReturnType<GameScene['assembleParts']>;
	modules!: ReturnType<GameScene['assembleModules']>;
	battleGrid: ('.' | '?' | 'X' | 'O')[][] = [];

	mechEnemy!: ReturnType<GameScene['assembleParts']>;
	modulesEnemy!: ReturnType<GameScene['assembleModules']>;
	battleGridEnemy: ('.' | '?' | 'X' | 'O')[][] = [];

	async buildMech(): Promise<void> {
		const done = await this.placeModules();
		if (!done) {
			this.modules.placed = [];
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

			let head = `head ${this.mech.headD.name}`;
			let chest = `chest ${this.mech.chestD.name}`;
			let arm = `arm ${this.mech.armLD.name}`;
			let leg = `leg ${this.mech.legLD.name}`;

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
				forCells(gridBtnsByPos, (x, y, btn) => {
					if (!btn) return;
					btn.spr.tint = 0xffffff;
					btn.spr.alpha = this.modules.grid[y][x] === 'x' ? 1 : 0;
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
						const idx = Number(this.modules.grid[y][x]);
						if (Number.isNaN(idx)) return;
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
					if (!dragging) {
						const idx = Number(this.modules.grid[y][x]);
						if (Number.isNaN(idx)) return;
						this.modules.container.children[idx].alpha = 0.5;
					}
				});
				btn.spr.addEventListener('pointerout', () => {
					if (target !== btn) return;
					target = null;
					checkPlacement();
					const idx = Number(this.modules.grid[y][x]);
					if (Number.isNaN(idx)) return;
					this.modules.container.children[idx].alpha = 1;
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
				width: modules.reduce((acc, i) => Math.max(acc, i.w), 0) * cellSize,
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
		this.mech.container.destroy({ children: true });
		this.mech = this.assembleParts(
			`head ${this.mech.headD.name}`,
			`chest ${this.mech.chestD.name}`,
			`arm ${this.mech.armLD.name}`,
			`leg ${this.mech.legLD.name}`
		);
		this.modules.container.destroy({ children: true });
		this.modules = this.assembleModules(this.modules?.placed || []);
		this.container.addChildAt(this.mech.container, 0);
		this.container.addChild(this.modules.container);

		this.mechEnemy.container.destroy({ children: true });
		this.mechEnemy = this.assembleParts(
			`head ${this.mechEnemy.headD.name}`,
			`chest ${this.mechEnemy.chestD.name}`,
			`arm ${this.mechEnemy.armLD.name}`,
			`leg ${this.mechEnemy.legLD.name}`
		);
		this.modulesEnemy.container.destroy({ children: true });
		this.modulesEnemy = this.assembleModules(this.modulesEnemy?.placed || []);
		this.container.addChildAt(this.mechEnemy.container, 0);
		this.container.addChild(this.modulesEnemy.container);
		this.modulesEnemy.container.visible = false;
		this.mechEnemy.container.children.forEach((i) => {
			if (i.children.length) i.visible = false;
		});

		// TODO: position based on game state
		this.mech.container.x -= Math.floor(size.x * (1 / 5));
		this.mech.container.y += size.y * 0.45;
		this.mechEnemy.container.x += Math.floor(size.x * (1 / 5));
		this.mechEnemy.container.y += size.y * 0.45;

		this.modules.container.x = this.mech.container.x;
		this.modules.container.y = this.mech.container.y;
		this.modules.container.x += this.mech.gridDimensions.x * cellSize;
		this.modules.container.y += this.mech.gridDimensions.y * cellSize;

		this.modulesEnemy.container.x = this.mechEnemy.container.x;
		this.modulesEnemy.container.y = this.mechEnemy.container.y;
		this.modulesEnemy.container.x += this.mechEnemy.gridDimensions.x * cellSize;
		this.modulesEnemy.container.y += this.mechEnemy.gridDimensions.y * cellSize;
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
				const placedModule = this.getPlacedModule(i);
				placedModule.cells = replaceCells(
					placedModule.cells,
					'0',
					idx.toString(10)
				);
				return placedModule;
			}),
		]);
		return {
			container,
			placed,
			grid,
		};
	}

	saveMech(who: 'player' | 'enemy' = 'player') {
		const [mech, modules] =
			who === 'player'
				? [this.mech, this.modules]
				: [this.mechEnemy, this.modulesEnemy];
		return {
			head: mech.headD.name,
			chest: mech.chestD.name,
			arms: mech.armLD.name,
			legs: mech.legLD.name,
			modules: modules.placed.map((i) => ({
				name: i.module.name,
				x: i.x,
				y: i.y,
				flipH: i.flipH,
				flipV: i.flipV,
				turns: i.turns,
			})),
		};
	}

	loadMech(
		who: 'player' | 'enemy' = 'player',
		data: string | ReturnType<GameScene['saveMech']>
	) {
		const [mech, modules] =
			who === 'player'
				? [this.mech, this.modules]
				: [this.mechEnemy, this.modulesEnemy];
		if (typeof data === 'string') {
			data = JSON.parse(data) as ReturnType<GameScene['saveMech']>;
		}
		mech.headD = this.getPart(`head ${data.head}`);
		mech.chestD = this.getPart(`chest ${data.chest}`);
		mech.armLD = this.getPart(`arm ${data.arms}`);
		mech.armRD = this.getPart(`arm ${data.arms}`, true);
		mech.legLD = this.getPart(`leg ${data.legs}`);
		mech.legRD = this.getPart(`leg ${data.legs}`, true);
		modules.placed = data.modules.map((i) => ({
			...i,
			module: this.getModule(`module ${i.name}`),
		}));
		this.reassemble();
	}

	getPlacedModule(i: GameScene['modules']['placed'][number]) {
		let cells = i.module.cells;
		cells = rotateMatrixClockwise(cells, i.turns);
		if (i.flipH) cells = flipMatrixH(cells);
		if (i.flipV) cells = flipMatrixV(cells);
		const ox = Math.floor(i.module.w / 2);
		const oy = Math.floor(i.module.h / 2);
		const o = [ox, oy];
		if (i.turns % 2) o.reverse();
		return {
			cells,
			x: i.x - o[0],
			y: i.y - o[1],
		};
	}

	moduleIsDestroyed(
		module: GameScene['modules']['placed'][number],
		cells: string[][]
	) {
		// TODO: check connected to cockpit
		let destroyed = false;
		this.forPlacedModuleCells(module, (x, y) => {
			if (destroyed) return;
			if (cells[y][x] === 'X') destroyed = true;
		});
		return destroyed;
	}

	forPlacedModuleCells(
		i: GameScene['modules']['placed'][number],
		cb: (x: number, y: number, cell: string) => void
	) {
		const placedModule = this.getPlacedModule(i);
		forCells(placedModule.cells, (x, y, cell) => {
			cb(x + placedModule.x, y + placedModule.y, cell);
		});
	}

	async fight() {
		let turnCount = 1;
		// reset battle grid
		this.battleGrid = replaceCells(
			copyCells(this.mech.grid),
			/[^.]/,
			'?'
		) as typeof this.battleGrid;
		this.battleGridEnemy = replaceCells(
			copyCells(this.mechEnemy.grid),
			/[^.]/,
			'?'
		) as typeof this.battleGrid;

		do {
			await this.pickActions();
			await this.playActions();
			// TODO: check win
			const won = false;
			if (won) {
				this.strand.won = true;
				return;
			}
			await this.enemyActions();
			const dead = turnCount > 2;
			if (dead) {
				this.strand.won = false;
				return;
			}
			++turnCount;
		} while (true);
	}

	actions: {
		shield: number;
		attacks: [number, number][];
		heatMax: number;
	} = {
		shield: 0,
		attacks: [],
		heatMax: 0,
	};

	pickActions() {
		// TODO
		return new Promise<void>((r) => {
			// reset
			this.actions.shield = 0;
			this.actions.attacks = [];

			const gridBtns: Btn[] = [];
			const gridBtnsByPos: Btn[][] = [];

			const containerBtns = new Container();
			containerBtns.x =
				this.mechEnemy.container.x +
				(this.mechEnemy.gridDimensions.x + 0.5) * cellSize;
			containerBtns.y =
				this.mechEnemy.container.y +
				(this.mechEnemy.gridDimensions.y + 0.5) * cellSize;

			forCells(this.mechEnemy.grid, (x, y) => {
				const btn = new Btn(() => {
					// TODO: inspect hit/revealed modules
				}, 'cell button');
				btn.spr.label = `${x},${y}`;
				btn.transform.x = x * cellSize;
				btn.transform.y = y * cellSize;
				containerBtns.addChild(btn.display.container);
				gridBtnsByPos[y] = gridBtnsByPos[y] || [];
				gridBtnsByPos[y][x] = btn;
				gridBtns.push(btn);
			});
			this.container.addChild(containerBtns);
			const tags = this.modules.placed
				.filter((i) => this.moduleIsDestroyed(i, this.battleGrid))
				.flatMap((i) => i.module.tags);
			let attacksMax = 0;
			let shieldsAmt = 0;
			this.actions.heatMax = 0;
			tags.forEach((tag) => {
				switch (tag) {
					case 'cockpit':
						++attacksMax;
						++this.actions.heatMax;
						break;
					case 'heatsink':
						++this.actions.heatMax;
						break;
					case 'attack':
						++attacksMax;
						break;
					case 'shield':
						++shieldsAmt;
						break;
				}
			});

			const updateHeat = () => {
				const heat = this.getHeat();
				textHeat.text = `heat: ${formatCount(heat, this.actions.heatMax)}`;
				if (heat > this.actions.heatMax) {
					textHeat.tint = 0xff0000;
				} else if (heat === this.actions.heatMax) {
					textHeat.tint = 0x00ff00;
				} else {
					textHeat.tint = 0xffffff;
				}
			};

			const updateAttacks = () => {
				if (this.actions.attacks.length < attacksMax) {
					textAttack.text = `attack (${
						attacksMax - this.actions.attacks.length
					})`;
					btnAttack.display.container.tint = 0x00ff00;
				} else {
					textAttack.text = `weapons primed`;
					btnAttack.display.container.tint = 0xff0000;
				}
				if (this.actions.attacks.length) {
					btnAttackUndo.display.container.tint = 0xffffff;
				} else {
					btnAttackUndo.display.container.tint = 0x999999;
				}

				gridBtns.forEach((i) => {
					i.display.container.visible = false;
					i.display.container.tint = 0xffffff;
				});
				this.actions.attacks.forEach((i) => {
					const btn = gridBtnsByPos[i[1]]?.[i[0]];
					if (!btn) return;
					btn.display.container.visible = true;
					btn.display.container.tint = 0xff0000;
				});
				updateHeat();
			};
			const textHeat = new BitmapText({
				text: 'heat',
				style: fontMechInfo,
			});
			const textAttack = new BitmapText({
				text: 'attack',
				style: fontMechInfo,
			});
			const btnAttack = new Btn(
				async () => {
					if (this.actions.attacks.length >= attacksMax) return;
					const removeModal = this.modal();
					const target = await this.pickTarget();
					removeModal();
					if (!target) return;
					this.actions.attacks.push(target);
					updateAttacks();
				},
				'button',
				'attack'
			);
			btnAttack.display.container.addChild(textAttack);

			const textAttackUndo = new BitmapText({
				text: 'undo',
				style: fontMechInfo,
			});
			const btnAttackUndo = new Btn(
				() => {
					if (!this.actions.attacks.length) return;
					this.actions.attacks.pop();
					updateAttacks();
				},
				'button',
				'undo attack'
			);
			btnAttackUndo.display.container.addChild(textAttackUndo);
			updateAttacks();

			const updateShields = () => {
				if (shieldsAmt) {
					textToggleShield.text = this.actions.shield
						? `shields: ${Math.floor(shieldsAmt * 100)}%`
						: 'shields: disabled';
					btnToggleShield.display.container.tint = this.actions.shield
						? 0x00ff00
						: 0x999999;
				} else {
					textToggleShield.text = 'shields: none';
					btnToggleShield.display.container.tint = 0xff0000;
				}
				updateHeat();
			};
			const textToggleShield = new BitmapText({
				text: 'shields',
				style: fontMechInfo,
			});
			const btnToggleShield = new Btn(
				() => {
					this.actions.shield = this.actions.shield ? 0 : shieldsAmt;
					updateShields();
				},
				'button',
				'toggle shields'
			);
			btnToggleShield.display.container.addChild(textToggleShield);
			updateShields();

			const textEnd = new BitmapText({
				text: 'end',
				style: fontMechInfo,
			});
			const btnEnd = new Btn(
				() => {
					if (!this.actions.shield && !this.actions.attacks.length) {
						// TODO: proper UI
						if (!window.confirm('Really skip your turn?')) return;
					}
					destroy();
					r();
				},
				'button',
				'end'
			);
			btnEnd.display.container.addChild(textEnd);
			updateShields();

			this.container.addChild(textHeat);
			textHeat.y -= btnAttack.display.container.height;
			this.container.addChild(btnAttack.display.container);
			btnAttackUndo.transform.x += btnAttack.display.container.width;
			this.container.addChild(btnAttackUndo.display.container);
			btnToggleShield.transform.y += btnAttack.display.container.height;
			this.container.addChild(btnToggleShield.display.container);
			btnEnd.transform.y += btnAttack.display.container.height;
			btnEnd.transform.y += btnToggleShield.display.container.height;
			this.container.addChild(btnEnd.display.container);

			const destroy = () => {
				textHeat.destroy();
				btnAttack.destroy();
				btnAttackUndo.destroy();
				btnToggleShield.destroy();
				btnEnd.destroy();
				gridBtns.forEach((i) => i.destroy());
				containerBtns.destroy();
			};
		});
	}

	pickTarget() {
		return new Promise<[number, number] | false>((r) => {
			const gridBtns: Btn[] = [];
			const gridBtnsByPos: Btn[][] = [];

			const containerBtns = new Container();
			containerBtns.x =
				this.mechEnemy.container.x +
				(this.mechEnemy.gridDimensions.x + 0.5) * cellSize;
			containerBtns.y =
				this.mechEnemy.container.y +
				(this.mechEnemy.gridDimensions.y + 0.5) * cellSize;

			const destroy = () => {
				containerBtns.destroy();
				document.removeEventListener('contextmenu', onContext);
			};

			forCells(this.mechEnemy.grid, (x, y) => {
				// TODO: leave out destroyed
				if (this.actions.attacks.some((i) => i[0] === x && i[1] === y)) return;
				const btn = new Btn(() => {
					destroy();
					r([x, y]);
				}, 'cell button');
				btn.spr.label = `${x},${y}`;
				btn.transform.x = x * cellSize;
				btn.transform.y = y * cellSize;
				containerBtns.addChild(btn.display.container);
				gridBtnsByPos[y] = gridBtnsByPos[y] || [];
				gridBtnsByPos[y][x] = btn;
				gridBtns.push(btn);
			});
			this.containerUI.addChild(containerBtns);

			const onContext = (event: MouseEvent) => {
				event.preventDefault();
				destroy();
				r(false);
			};
			document.addEventListener('contextmenu', onContext, { once: true });
		});
	}

	getHeat() {
		return this.actions.attacks.length + this.actions.shield;
	}

	playActions() {
		// TODO
		return new Promise<void>(async (r) => {
			window.alert('play actions');
			// TODO: shield feedback
			this.actions.attacks.forEach((i) => {
				// TODO: hit enemy shields from last turn
				// TODO: hit targeted cells
				i[0], i[1];
			});
			// TODO: hit self from overheat
			let overheat = this.getHeat() - this.actions.heatMax;
			while (overheat-- > 0) {
				// TODO: animation
				await delay(100);
				// find heatsinks
				const target = this.modules.placed
					.filter((i) => i.module.tags.includes('heatsink'))
					// and cockpits (lower priority)
					.concat(
						this.modules.placed.filter((i) => i.module.tags.includes('cockpit'))
					)
					// that aren't destroyed
					.filter((i) => !this.moduleIsDestroyed(i, this.battleGrid))[0];
				if (!target) break; // already dead
				// destroy part
				this.forPlacedModuleCells(target, (x, y) => {
					this.battleGrid[y][x] = 'X';
				});
			}
			r();
		});
	}

	enemyActions() {
		// TODO
		return new Promise<void>((r) => {
			window.alert('enemy turn');
			const tags = this.modulesEnemy.placed.flatMap((i) => {
				// TODO: check if active
				const active = true;
				if (!active) return [];
				return i.module.tags;
			});
			tags;
			// TODO: decide whether to enable shields
			// - early or after reveals?
			// TODO: decide player targets
			// - search around revealed parts
			// - search randomly
			// - when to be more/less aggressive?
			// - when to overheat?
			r();
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
