import eases from 'eases';
import { BitmapText, Container, NineSliceSprite, Sprite } from 'pixi.js';
import { Area } from './Area';
import { Border } from './Border';
import { Btn } from './Btn';
import { BtnText } from './BtnText';
import { Camera } from './Camera';
import { game, resource } from './Game';
import { GameObject } from './GameObject';
import { ScreenFilter } from './ScreenFilter';
import { Updater } from './Scripts/Updater';
import { Spr9 } from './Spr9';
import { StrandE } from './StrandE';
import { Tween, TweenManager } from './Tweens';
import { UIDialogue } from './UIDialogue';
import { V } from './VMath';
import { cellSize, size } from './config';
import { DEBUG } from './debug';
import { fontDialogue, fontMechInfo } from './font';
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
import { makePart, MechD, mechPartParse, MechD as PartD } from './mech-part';
import { Scroller } from './scroller';
import { gray, green, red, white } from './tints';
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
	setTextWrapped,
	shuffle,
	smartify,
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

	tweenFocus?: Tween;
	focus = new Container();

	panelTip: NineSliceSprite;
	textTip: BitmapText;
	setFocus(
		x: number,
		y?: number,
		duration?: number,
		ease?: (t: number) => number
	) {
		if (this.tweenFocus) TweenManager.finish(this.tweenFocus);
		this.tweenFocus = undefined;
		if (y === undefined) y = this.focus.y;
		if (!duration) {
			this.focus.x = x;
			this.focus.y = y;
			return;
		}
		this.tweenFocus = TweenManager.tween(
			this.focus,
			'x',
			x,
			duration,
			undefined,
			ease
		);
		this.tweenFocus = TweenManager.tween(
			this.focus,
			'y',
			y,
			duration,
			undefined,
			ease
		);
	}

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

		this.container.addChild(this.focus);
		this.camera.setTarget(this.focus);

		this.panelTip = new Spr9('panel');
		this.textTip = new BitmapText({ text: '\u000f', style: fontDialogue });
		this.textTip.style.align = 'right';
		this.textTip.x = 8;
		this.textTip.y = 8;
		this.panelTip.addChild(this.textTip);
		this.containerUI.addChild(this.panelTip);
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
		this.loadMech('player', {
			head: 'Tallboy 2000',
			chest: '1',
			arms: '1',
			legs: '2',
			modules: [],
		});
		await this.pickParts();
		await this.buildMech();
		await this.scenePrefight();
		await this.fight();
		await this.scenePostfight();
		do {
			this.battleGrid = [];
			this.battleGridEnemy = [];
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
		this.setFocus(-size.x);
		this.strand.goto(`${this.strand.next} prebuild`);
		return this.waitForClose();
	}

	scenePrefight() {
		this.setFocus(size.x, undefined, 500, eases.cubicIn);
		this.strand.goto(`${this.strand.next} prefight`);
		return this.waitForClose();
	}

	scenePostfight() {
		this.strand.goto(`${this.strand.next} postfight`);
		return this.waitForClose();
	}

	pieces: Record<'heads' | 'arms' | 'legs' | 'chests' | 'modules', string[]>;

	costMax = 1000;

	mech!: ReturnType<GameScene['assembleParts']>;
	modules!: ReturnType<GameScene['assembleModules']>;
	battleGrid: ('.' | '?' | 'X' | 'O')[][] = [];
	damageBtns!: ReturnType<GameScene['makeBtnGrid']>;

	mechEnemy!: ReturnType<GameScene['assembleParts']>;
	modulesEnemy!: ReturnType<GameScene['assembleModules']>;
	battleGridEnemy: ('.' | '?' | 'X' | 'O')[][] = [];
	damageBtnsEnemy!: ReturnType<GameScene['makeBtnGrid']>;

	async buildMech(): Promise<void> {
		const done = await this.placeModules();
		if (!done) {
			this.modules.placed = [];
			await this.pickParts();
			return this.buildMech();
		}
	}

	getGeneralInfo() {
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
		return `
- TOTALS
PRICE:  ${formatCount(cost, this.costMax)}
SPACE: ${formatCount(freeCells, allCells)}

---------------------

`;
	}

	transitionIn(item: Container, duration: number) {
		const tweens = [
			TweenManager.tween(
				item,
				'x',
				item.x,
				duration,
				item.x + item.width * 1.5,
				eases.backOut
			),
			TweenManager.tween(item.scale, 'x', 1, duration, 0, eases.backOut),
			TweenManager.tween(item, 'alpha', 1, duration, 0, eases.cubicOut),
		];
		return tweens;
	}

	transitionOut(item: Container, duration: number) {
		const tweens = [
			TweenManager.tween(
				item,
				'x',
				item.x - item.width * 1.5,
				duration,
				undefined,
				eases.circIn
			),
			TweenManager.tween(item.scale, 'x', 2, duration, undefined, eases.circIn),
			TweenManager.tween(item, 'alpha', 0, duration, undefined, eases.cubicIn),
		];
		return tweens;
	}

	pickParts() {
		this.setFocus(
			-size.x / 3 + this.mech.container.x,
			undefined,
			500,
			eases.cubicInOut
		);
		return new Promise<void>(async (donePickingParts) => {
			const cycler = <T>(
				update: (item: T, idx: number) => void,
				items: T[],
				selected: T = items[0]
			) => {
				let index = items.indexOf(selected);
				const btnPrev = new Btn(() => {
					--index;
					if (index < 0) index = items.length - 1;
					update(items[index], index);
				}, 'buttonArrow');
				btnPrev.display.container.scale.x *= -1;
				const btnNext = new Btn(() => {
					++index;
					index %= items.length;
					update(items[index], index);
				}, 'buttonArrow');
				const container = new Container();
				btnPrev.transform.x -= btnPrev.display.container.width / 2;
				btnNext.transform.x += btnNext.display.container.width / 2;
				container.addChild(btnPrev.display.container);
				container.addChild(btnNext.display.container);
				update(items[index], index);
				return { container, btnPrev, btnNext };
			};

			const scrollerHeads = new Scroller({
				width: 300,
				height: size.y,
				gap: 10,
			});
			const scrollerChests = new Scroller({
				width: 300,
				height: size.y,
				gap: 10,
			});
			const scrollerArms = new Scroller({
				width: 300,
				height: size.y,
				gap: 10,
			});
			const scrollerLegs = new Scroller({
				width: 300,
				height: size.y,
				gap: 10,
			});

			const textType = new BitmapText({
				text: '\u00A0\u000f \u0007 \u0007 \u0007\u00A0\nHEAD',
				style: fontDialogue,
			});
			textType.x -= textType.width / 2;
			textType.y -= textType.height / 2;

			const {
				container: containerScrollersCycler,
				btnNext,
				btnPrev,
			} = cycler(
				(scroller, idx) => {
					[scrollerHeads, scrollerChests, scrollerArms, scrollerLegs].forEach(
						(i) => {
							i.container.visible = false;
							scroller.container.visible = true;
						}
					);
					textType.text = smartify(
						` ${'\u0007 '.repeat(idx)}\u000f ${'\u0007 '.repeat(3 - idx)}\n   ${
							['HEAD', 'MAIN', 'ARMS', 'LEGS'][idx]
						}`
					);
				},
				[scrollerHeads, scrollerChests, scrollerArms, scrollerLegs],
				scrollerHeads
			);

			let lastPart: MechD = this.getPart(`head ${this.mech.headD.name}`);
			(
				[
					['head', this.mech.headD.name, this.pieces.heads, scrollerHeads],
					['chest', this.mech.chestD.name, this.pieces.chests, scrollerChests],
					['arm', this.mech.armLD.name, this.pieces.arms, scrollerArms],
					['leg', this.mech.legLD.name, this.pieces.legs, scrollerLegs],
				] as const
			).forEach(([type, current, pieces, scroller]) => {
				const sprPadding = new Sprite(tex('blank'));
				sprPadding.height = 100;
				scroller.addChild(sprPadding);
				pieces.forEach((i) => {
					const part = this.getPart(i);
					const spr = new Sprite(part.tex);
					buttonify(spr, i);
					spr.addEventListener('click', () => {
						lastPart = part;
						switch (type) {
							case 'head':
								this.mech.headD = part;
								break;
							case 'chest':
								this.mech.chestD = part;
								break;
							case 'arm':
								this.mech.armLD = part;
								this.mech.armRD = this.getPart(i, true);
								break;
							case 'leg':
								this.mech.legLD = part;
								this.mech.legRD = this.getPart(i, true);
								break;
						}
						scroller.containerScroll.children.forEach((j) => {
							j.tint = white;
						});
						spr.tint = green;
						update();
					});
					if (i === `${type} ${current}`) spr.tint = green;
					scroller.addChild(spr);
				});
			});

			const textInfo = new BitmapText({ text: '', style: fontDialogue });
			textInfo.style.wordWrapWidth = size.x / 3 - 32;
			const panelInfo = new Spr9('panel');
			panelInfo.width = size.x / 3;
			panelInfo.height = size.y - 10;
			panelInfo.x -= size.x / 2;
			panelInfo.x += scrollerChests.container.width;
			panelInfo.y -= panelInfo.height / 2;
			textInfo.x += 16;
			textInfo.y += 16;
			panelInfo.addChild(textInfo);

			let containerBtns = new Container();
			const update = () => {
				this.reassemble();

				containerBtns.destroy();
				const btns = this.makeBtnGrid('player', (btn, x, y, cell) => {
					btn.spr.alpha = 0.4;
					if (cell === '=') {
						btn.spr.texture = tex('cell joint');
					}
					btn.spr.addEventListener('pointerover', () => {
						if (cell === '=') {
							this.textTip.text = 'joint';
						} else if (cell === '0') {
							this.textTip.text = 'empty cell';
						}
					});
				});
				containerBtns = btns.container;
				this.container.addChild(btns.container);

				setTextWrapped(
					textInfo,
					`${this.getGeneralInfo()}${smartify(`"${lastPart.name}"
 
$${lastPart.cost} | ${lastPart.cellCount} CELLS
 
${lastPart.description}`)}`
				);
			};
			update();

			const btnDone = new BtnText('DONE', async () => {
				btnDone.enabled = false;
				btnNext.enabled = false;
				btnPrev.enabled = false;
				const closeModal = this.modal(0);
				donePickingParts();
				this.screenFilter.flash(0.5, 500, eases.circOut);

				const tweens: Tween[] = [];
				tweens.push(...this.transitionOut(panelInfo, 300));
				tweens.push(...this.transitionOut(containerScrollers, 200));
				await delay(300);
				tweens.forEach((i) => TweenManager.abort(i));

				[scrollerHeads, scrollerChests, scrollerArms, scrollerLegs].forEach(
					(i) => {
						i.destroy();
					}
				);
				containerBtns.destroy();
				btnDone.destroy();
				btnNext.destroy();
				btnPrev.destroy();
				panelInfo.destroy();

				closeModal();
			});
			const containerScrollers = new Container();
			this.containerUI.addChild(containerScrollers);
			containerScrollers.addChild(scrollerHeads.container);
			containerScrollers.addChild(scrollerChests.container);
			containerScrollers.addChild(scrollerArms.container);
			containerScrollers.addChild(scrollerLegs.container);
			containerScrollers.addChild(containerScrollersCycler);
			this.containerUI.addChild(panelInfo);
			panelInfo.addChild(btnDone.display.container);

			[scrollerHeads, scrollerChests, scrollerArms, scrollerLegs].forEach(
				(i) => {
					i.container.x -= size.x / 2;
					i.container.y -= size.y / 2;
				}
			);

			containerScrollersCycler.x -= size.x / 2;
			containerScrollersCycler.x += scrollerHeads.container.width / 2;
			containerScrollersCycler.y -= size.y / 2;
			containerScrollersCycler.y += containerScrollersCycler.height;
			containerScrollersCycler.addChild(textType);
			btnPrev.transform.x -= textType.width / 2;
			btnNext.transform.x += textType.width / 2;

			btnDone.transform.x += 350;
			btnDone.transform.x -= btnDone.display.container.width / 2;
			btnDone.transform.y += size.x / 2;
			btnDone.transform.y -= btnDone.display.container.height / 2;

			const sprPanel = new Spr9('panel');
			sprPanel.width = containerScrollersCycler.width + 10;
			sprPanel.height = containerScrollersCycler.height + 10;
			sprPanel.x -= sprPanel.width / 2;
			sprPanel.y -= sprPanel.height / 2;
			containerScrollersCycler.addChildAt(sprPanel, 0);

			const closeModal = this.modal(0);
			this.transitionIn(panelInfo, 400);
			this.transitionIn(containerScrollers, 500);
			await delay(500);
			closeModal();
		});
	}

	makeBtnGrid(
		who: 'player' | 'enemy',
		cb: (btn: Btn, x: number, y: number, cell: string) => void
	) {
		const grid = who === 'player' ? this.mech.grid : this.mechEnemy.grid;
		const mech = who === 'player' ? this.mech : this.mechEnemy;
		const container = new Container();
		const gridBtns: Btn[] = [];
		const gridBtnsByPos: Btn[][] = [];
		const noop = () => {};
		forCells(grid, (x, y, cell) => {
			const btn = new Btn(noop, 'cell button');
			btn.spr.label = `${x},${y}`;
			btn.transform.x = x * cellSize;
			btn.transform.y = y * cellSize;
			container.addChild(btn.display.container);
			gridBtnsByPos[y] = gridBtnsByPos[y] || [];
			gridBtnsByPos[y][x] = btn;
			gridBtns.push(btn);
			cb(btn, x, y, cell);
		});
		container.x = mech.container.x + (mech.gridDimensions.x + 0.5) * cellSize;
		container.y = mech.container.y + (mech.gridDimensions.y + 0.5) * cellSize;
		return { container, gridBtns, gridBtnsByPos };
	}

	placeModules() {
		this.setFocus(
			size.x / 3 + this.mech.container.x,
			undefined,
			500,
			eases.cubicInOut
		);
		return new Promise<boolean>(async (donePlacingModules) => {
			await delay(500);
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

			let lastModule: ModuleD = modules[0];
			const updateInfo = () => {
				setTextWrapped(
					textInfo,
					`${this.getGeneralInfo()}${smartify(`"${lastModule.name}"
 
$${lastModule.cost} | ${lastModule.cellCount} CELLS
 
${lastModule.description}`)}`
				);
			};

			const {
				container: containerBtns,
				gridBtns,
				gridBtnsByPos,
			} = this.makeBtnGrid('player', (btn, x, y, cell) => {
				if (cell === '=') {
					btn.spr.texture = tex('cell joint');
					btn.enabled = false;
				}
				btn.onClick = (event) => {
					const copying = event.shiftKey || event.ctrlKey;
					if (!dragging) {
						// check for module
						const idx = Number(this.modules.grid[y][x]);
						if (Number.isNaN(idx)) return;
						let module: GameScene['modules']['placed'][number];
						if (this.modules.placed[idx].module.tags.includes('joint')) return; // can't move joints
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
						updateInfo();
					}
				};
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
			});

			const checkPlacement = () => {
				valid = false;
				forCells(gridBtnsByPos, (x, y, btn) => {
					if (!btn) return;
					btn.spr.tint = white;
					if (btn !== target && btn.enabled)
						btn.spr.texture = tex('cell button_normal');
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
					btnNeighbour.spr.tint = valid ? green : red;
					if (btnNeighbour !== target && btnNeighbour.enabled)
						btnNeighbour.spr.texture = tex('cell button_over');
				});
			};

			const startDragging = (moduleD: ModuleD) => {
				dragging = makeModule(moduleD);
				dragging.alpha = 0.5;
				this.containerUI.addChild(dragging);
				lastModule = moduleD;
				updateInfo();
				return dragging;
			};

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
			const sprPadding = new Sprite(tex('blank'));
			sprPadding.height = 100;
			scroller.addChild(sprPadding);
			modules.forEach((moduleD) => {
				const uiModule = makeModule(moduleD);
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

			const textInfo = new BitmapText({ text: '', style: fontDialogue });
			textInfo.style.wordWrapWidth = size.x / 3 - 32;
			const panelInfo = new Spr9('panel');
			panelInfo.width = size.x / 3;
			panelInfo.x -= panelInfo.width / 2;
			panelInfo.height = size.y - 10;
			panelInfo.y -= panelInfo.height / 2;
			textInfo.x += 16;
			textInfo.y += 16;
			panelInfo.addChild(textInfo);

			const destroy = () => {
				document.removeEventListener('contextmenu', onContext);
				removeFromArray(this.camera.scripts, dragger);
				panelInfo.destroy();
				btnDone.destroy();
				btnBack.destroy();
				scroller.destroy();
				gridBtns.forEach((i) => i.destroy());
			};
			const btnBack = new BtnText('BACK', () => {
				if (this.modules.placed.length) {
					// TODO: proper ui
					if (!window.confirm('this will remove all modules, are you sure?'))
						return;
				}
				destroy();
				donePlacingModules(false);
			});
			const btnDone = new BtnText('DONE', () => {
				// TODO: cost check
				// if (this.mechinfo.text.includes('!!!')) {
				// 	// TODO: proper ui
				// 	window.alert('too expensive!');
				// 	return;
				// }
				if (
					!this.modules.placed.some((i) => i.module.tags.includes('cockpit'))
				) {
					// TODO: proper ui
					window.alert('you have NO cockpit!');
					return;
				}
				destroy();
				donePlacingModules(true);
			});
			this.container.addChild(containerBtns);
			this.containerUI.addChild(scroller.container);
			this.containerUI.addChild(panelInfo);
			this.containerUI.addChild(btnDone.display.container);
			this.containerUI.addChild(btnBack.display.container);
			btnDone.transform.y -= btnDone.display.container.height;
			btnBack.transform.y -= btnBack.display.container.height;
			btnDone.transform.x += size.x / 4;
			btnBack.transform.x += size.x / 4 - btnBack.display.container.width;

			updateInfo();
			this.reassemble();
		});
	}

	reassemble() {
		this.mech.container.destroy({ children: true });
		this.mech = this.assembleParts(
			`head ${this.mech.headD.name}`,
			`chest ${this.mech.chestD.name}`,
			`arm ${this.mech.armLD.name}`,
			`leg ${this.mech.legLD.name}`,
			this.battleGrid.length > 0
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

		// TODO: better destroyed module display
		this.damageBtns?.container.destroy();
		this.damageBtns?.gridBtns.forEach((i) => i.destroy());
		if (this.battleGrid.length) {
			this.damageBtns = this.makeBtnGrid('player', (btn, x, y, cell) => {
				if (this.battleGrid[y][x] === 'X') {
					btn.spr.texture = tex(
						this.mech.grid[y][x] === '=' || this.modules.grid[y][x] !== 'x'
							? 'cell damaged'
							: 'cell detect_empty'
					);
					btn.enabled = false;
				} else {
					btn.display.container.visible = false;
				}
			});
			this.container.addChild(this.damageBtns.container);
			this.modules.placed.forEach((i, idx) => {
				if (this.moduleIsDestroyed(i, this.battleGrid)) {
					this.modules.container.children[idx].tint = red;
				}
			});
		}
		this.damageBtnsEnemy?.container.destroy();
		this.damageBtnsEnemy?.gridBtns.forEach((i) => i.destroy());
		if (this.battleGridEnemy.length) {
			this.damageBtnsEnemy = this.makeBtnGrid('enemy', (btn, x, y, cell) => {
				btn.onClick = () => {
					// TODO: say what it is
				};
				if (this.battleGridEnemy[y][x] === 'X') {
					btn.spr.texture = tex(
						this.mechEnemy.grid[y][x] === '=' ||
							this.modulesEnemy.grid[y][x] !== 'x'
							? 'cell damaged'
							: 'cell detect_empty'
					);
					btn.enabled = false;
				} else {
					btn.display.container.visible = false;
				}
			});
			this.container.addChild(this.damageBtnsEnemy.container);
			this.modulesEnemy.placed.forEach((i, idx) => {
				if (this.moduleIsDestroyed(i, this.battleGridEnemy)) {
					this.modulesEnemy.container.children[idx].visible = true;
					this.modulesEnemy.container.children[idx].tint = red;
				} else {
					this.modulesEnemy.container.children[idx].visible = false;
				}
			});
		}
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
		legKey: string,
		showCells?: boolean
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
		const [sprHead, cellsHead] = makePart(headD, showCells);
		const [sprChest, cellsChest] = makePart(chestD, showCells);
		const [sprArmR, cellsArmR] = makePart(armRD, showCells);
		const [sprArmL, cellsArmL] = makePart(armLD, showCells);
		const [sprLegR, cellsLegR] = makePart(legRD, showCells);
		const [sprLegL, cellsLegL] = makePart(legLD, showCells);
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
		let destroyed = true;
		this.forPlacedModuleCells(module, (x, y) => {
			if (!destroyed) return;
			if (cells[y]?.[x] !== 'X') destroyed = false;
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
		this.setFocus(0, -size.y);
		this.setFocus(0, 0, 1000, eases.cubicOut);
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
		this.reassemble();

		do {
			await this.pickActions();
			await this.playActions();
			{
				const lost = !this.modules.placed.some(
					(i) =>
						i.module.tags.includes('cockpit') &&
						!this.moduleIsDestroyed(i, this.battleGrid)
				);
				if (lost) {
					this.strand.won = false;
					return;
				}
			}
			const won = !this.modulesEnemy.placed.some(
				(i) =>
					i.module.tags.includes('cockpit') &&
					!this.moduleIsDestroyed(i, this.battleGridEnemy)
			);
			if (won) {
				this.strand.won = true;
				return;
			}
			await this.enemyActions();
			const lost = !this.modules.placed.some(
				(i) =>
					i.module.tags.includes('cockpit') &&
					!this.moduleIsDestroyed(i, this.battleGrid)
			);
			if (lost) {
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

	tagsToPossibleActions(tags: string[]) {
		let attacksMax = 0;
		let shieldsAmt = 0;
		let heatMax = 0;
		tags.forEach((tag) => {
			switch (tag) {
				case 'cockpit':
					++attacksMax;
					++heatMax;
					break;
				case 'heatsink':
					++heatMax;
					break;
				case 'attack':
					++attacksMax;
					break;
				case 'shield':
					++shieldsAmt;
					break;
			}
		});
		return { attacksMax, shieldsAmt, heatMax };
	}

	pickActions() {
		// TODO
		return new Promise<void>((r) => {
			// reset
			this.actions.shield = 0;
			this.actions.attacks = [];

			const {
				container: containerBtns,
				gridBtns,
				gridBtnsByPos,
			} = this.makeBtnGrid('enemy', (btn, x, y) => {
				btn.enabled = false;
				btn.spr.texture = tex('cell detect_filled');
				btn.display.container.tint = red;
			});

			this.container.addChild(containerBtns);
			const tags = this.modules.placed
				.filter((i) => !this.moduleIsDestroyed(i, this.battleGrid))
				.flatMap((i) => i.module.tags);
			const { attacksMax, shieldsAmt, heatMax } =
				this.tagsToPossibleActions(tags);
			this.actions.heatMax = heatMax;

			const updateHeat = () => {
				containerHeat.children.forEach((i) => {
					i.destroy();
				});
				const heat = this.getHeat();
				for (let i = 0; i < Math.max(heat, heatMax); ++i) {
					const textCount = new BitmapText({
						text: i.toString(10),
						style: fontMechInfo,
					});
					const sprHeatBg = new Sprite(tex('heatbar empty'));
					sprHeatBg.anchor.x = 0.5;
					sprHeatBg.y -= (sprHeatBg.height - 5) * i;
					if (i >= heatMax) {
						sprHeatBg.y += sprHeatBg.height / 2;
						sprHeatBg.scale.y *= -1;
						textCount.scale.y *= -1;
						textCount.y += sprHeatBg.height / 2;
					}
					textCount.x += sprHeatBg.width / 2 + 2;
					textCount.y += sprHeatBg.height / 2;
					sprHeatBg.addChild(textCount);
					containerHeat.addChild(sprHeatBg);
				}
				for (let i = 0; i < heat; ++i) {
					const sprHeatFill = new Sprite(tex('heatbar full'));
					sprHeatFill.anchor.x = 0.5;
					sprHeatFill.y -= (sprHeatFill.height - 5) * i;
					if (i >= heatMax) {
						sprHeatFill.y += sprHeatFill.height / 2;
						sprHeatFill.scale.y *= -1;
						sprHeatFill.tint = red;
					}
					if (heat === heatMax) {
						sprHeatFill.tint = green;
					}
					containerHeat.addChild(sprHeatFill);
				}
			};

			const updateAttacks = () => {
				if (this.actions.attacks.length < attacksMax) {
					btnAttack.setText(
						`attack (${attacksMax - this.actions.attacks.length})`
					);
					btnAttack.display.container.tint = green;
				} else {
					btnAttack.setText(`weapons primed`);
					btnAttack.display.container.tint = red;
				}
				if (this.actions.attacks.length) {
					btnAttackUndo.display.container.tint = white;
				} else {
					btnAttackUndo.display.container.tint = gray;
				}

				gridBtns.forEach((i) => {
					i.display.container.visible = false;
				});
				this.actions.attacks.forEach((i) => {
					const btn = gridBtnsByPos[i[1]]?.[i[0]];
					if (!btn) return;
					btn.display.container.visible = true;
				});
				updateHeat();
			};

			const containerHeat = new Container();
			const btnAttack = new BtnText('attack', async () => {
				if (this.actions.attacks.length >= attacksMax) return;
				const removeModal = this.modal();
				const target = await this.pickTarget();
				removeModal();
				if (!target) return;
				this.actions.attacks.push(target);
				updateAttacks();
			});

			const btnAttackUndo = new BtnText(
				'undo',
				() => {
					if (!this.actions.attacks.length) return;
					this.actions.attacks.pop();
					updateAttacks();
				},
				'undo attack'
			);
			updateAttacks();

			const updateShields = () => {
				if (shieldsAmt) {
					btnToggleShield.setText(
						this.actions.shield
							? `shields: ${Math.floor(shieldsAmt * 100)}%`
							: 'shields: disabled'
					);
					btnToggleShield.display.container.tint = this.actions.shield
						? green
						: gray;
				} else {
					btnToggleShield.setText('shields: none');
					btnToggleShield.display.container.tint = red;
				}
				updateHeat();
			};
			const btnToggleShield = new BtnText(
				'shields',
				() => {
					this.actions.shield = this.actions.shield ? 0 : shieldsAmt;
					updateShields();
				},
				'toggle shields'
			);
			updateShields();

			const btnEnd = new BtnText('end', () => {
				if (!this.actions.shield && !this.actions.attacks.length) {
					// TODO: proper UI
					if (!window.confirm('Really skip your turn?')) return;
				}
				destroy();
				r();
			});
			updateShields();

			this.container.addChild(containerHeat);
			containerHeat.y -= btnAttack.display.container.height;
			this.container.addChild(btnAttack.display.container);
			btnAttackUndo.transform.x += btnAttack.display.container.width;
			this.container.addChild(btnAttackUndo.display.container);
			btnToggleShield.transform.y += btnAttack.display.container.height;
			this.container.addChild(btnToggleShield.display.container);
			btnEnd.transform.y += btnAttack.display.container.height;
			btnEnd.transform.y += btnToggleShield.display.container.height;
			this.container.addChild(btnEnd.display.container);

			const destroy = () => {
				containerHeat.destroy();
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
			const { container: containerBtns, gridBtns } = this.makeBtnGrid(
				'enemy',
				(btn, x, y) => {
					if (
						this.battleGridEnemy[y][x] === 'X' ||
						this.actions.attacks.some((i) => i[0] === x && i[1] === y)
					) {
						btn.enabled = false;
						btn.display.container.visible = false;
						return;
					}
					btn.onClick = () => {
						destroy();
						r([x, y]);
					};
				}
			);
			const destroy = () => {
				containerBtns.destroy();
				gridBtns.forEach((i) => i.destroy());
				document.removeEventListener('contextmenu', onContext);
			};

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

	overheat(placed: GameScene['modules']['placed'], grid: string[][]) {
		// find heatsinks
		const target = shuffle(
			placed.filter((i) => i.module.tags.includes('heatsink'))
		)
			// and cockpits (lower priority)
			.concat(shuffle(placed.filter((i) => i.module.tags.includes('cockpit'))))
			// that aren't destroyed
			.filter((i) => !this.moduleIsDestroyed(i, grid))[0];
		if (!target) return; // already dead
		// destroy part
		this.forPlacedModuleCells(target, (x, y) => {
			grid[y][x] = 'X';
		});
		this.reassemble();
	}

	async attack({
		attacks,
		grid,
		shields,
	}: {
		attacks: [number, number][];
		grid: string[][];
		shields: number;
	}) {
		for (let [x, y] of attacks) {
			await delay(100);
			if (shields-- > 0) {
				// TODO: hit shield feedback
				continue;
			}
			// TODO: hit feedback
			grid[y][x] = 'X';
			this.reassemble();
		}
	}

	playActions() {
		// TODO
		return new Promise<void>(async (r) => {
			window.alert('play actions');
			let shields = 0; // TODO: get enemy shields from last turn
			await this.attack({
				attacks: this.actions.attacks,
				shields,
				grid: this.battleGridEnemy,
			});
			// TODO: hit self from overheat
			let overheat = this.getHeat() - this.actions.heatMax;
			while (overheat-- > 0) {
				// TODO: animation
				await delay(100);
				await this.overheat(this.modules.placed, this.battleGrid);
			}
			r();
		});
	}

	enemyActions() {
		// TODO
		return new Promise<void>(async (r) => {
			window.alert('enemy turn');
			const tags = this.modulesEnemy.placed
				.filter((i) => !this.moduleIsDestroyed(i, this.battleGridEnemy))
				.flatMap((i) => i.module.tags);
			const { attacksMax, shieldsAmt, heatMax } =
				this.tagsToPossibleActions(tags);
			let shields = 0;
			let attacks: [number, number][] = [];

			// pick enemy actions
			// TODO: better deciding whether to enable shields
			// - early or after reveals?
			if (shieldsAmt < heatMax && randItem([true, false])) {
				shields = shieldsAmt;
			} else if (
				shieldsAmt > heatMax &&
				heatMax > 1 &&
				randItem([true, false, false, false, false, false])
			) {
				shields = shieldsAmt;
			}

			// pick targets
			// TODO: better deciding what to target
			// prioritize:
			// 1. revealed parts
			// 2. around partially destroyed parts
			// 3. random
			let possibleTargets: [number, number][] = [];
			forCells(this.battleGrid, (x, y, cell) => {
				if (cell !== 'X') {
					possibleTargets.push([x, y]);
				}
			});
			possibleTargets = shuffle(possibleTargets);

			for (let i = 0; i < attacksMax; ++i) {
				// TODO: better deciding whether to shoot
				// - when to be more/less aggressive?
				// - when to overheat?
				if (randItem([true, false, false])) continue;
				if (heatMax - shields - attacks.length < 0 && heatMax <= 1) continue;
				if (
					heatMax - shields - attacks.length < 0 &&
					randItem([true, false, false, false, false, false])
				)
					continue;

				const target = possibleTargets.pop();
				if (!target) break;
				attacks.push(target);
			}

			// play enemy actions
			shields; // TODO: save for next turn

			await this.attack({
				attacks: attacks,
				shields: this.actions.shield,
				grid: this.battleGrid,
			});

			let overheat = this.getHeat() - heatMax;
			while (overheat-- > 0) {
				// TODO: animation
				await delay(100);
				await this.overheat(this.modulesEnemy.placed, this.battleGridEnemy);
			}
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

		GameObject.update();
		TweenManager.update();

		this.containerUI.addChild(this.panelTip);
		this.panelTip.width = this.textTip.width + 16;
		this.panelTip.height = this.textTip.height + 16;
		this.panelTip.x = size.x / 2 - this.panelTip.width - 10;
		this.panelTip.y = -size.y / 2 + this.panelTip.height - 26;

		this.containerUI.x = this.camera.display.container.pivot.x;
		this.containerUI.y = this.camera.display.container.pivot.y;
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
