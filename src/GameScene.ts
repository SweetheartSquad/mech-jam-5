import eases from 'eases';
import {
	BitmapText,
	Container,
	Graphics,
	NineSliceSprite,
	Sprite,
} from 'pixi.js';
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
import { costMax } from './costs';
import { DEBUG } from './debug';
import { fontDialogue, fontMechInfo } from './font';
import {
	copyCells,
	displayToPlacementProps,
	flatten,
	forCells,
	getFlood,
	replaceCells,
	rotateCellsByDisplay,
} from './layout';
import { error, warn } from './logger';
import { getInput, mouse } from './main';
import { makeModule, mechModuleParse, ModuleD } from './mech-module';
import { makePart, MechD, mechPartParse, MechD as PartD } from './mech-part';
import { Scroller } from './scroller';
import {
	black,
	blueHalf,
	gray,
	green,
	greenHalf,
	red,
	redHalf,
	white,
} from './tints';
import {
	buttonify,
	delay,
	flipMatrixH,
	flipMatrixV,
	formatCount,
	lerp,
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
		this.mech = this.assembleParts(
			this.pieces.heads[0],
			this.pieces.chests[0],
			this.pieces.arms[0],
			this.pieces.legs[0]
		);
		this.mechEnemy = this.assembleParts(
			this.pieces.heads[0],
			this.pieces.chests[0],
			this.pieces.arms[0],
			this.pieces.legs[0]
		);
		this.modules = this.assembleModules(this.mech.grid, []);
		this.modulesEnemy = this.assembleModules(this.mechEnemy.grid, []);
		await this.scenePrebuild();
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

	modal(opacity = 0.25, tint = black) {
		const spr = new Sprite(tex('white'));
		spr.tint = tint;
		spr.width = size.x * 2;
		spr.height = size.y * 2;
		spr.anchor.x = spr.anchor.y = 0.5;
		spr.alpha = 0;
		let tween = TweenManager.tween(
			spr,
			'alpha',
			opacity,
			250,
			undefined,
			eases.cubicIn
		);
		spr.interactive = true;
		this.containerUI.addChild(spr);
		return async () => {
			TweenManager.abort(tween);
			tween = TweenManager.tween(
				spr,
				'alpha',
				0,
				150,
				undefined,
				eases.cubicOut
			);
			spr.interactive = false;
			await delay(150);
			TweenManager.abort(tween);
			spr.destroy();
		};
	}

	confirm(msg: string, confirm = 'OK', cancel = 'NVM') {
		return new Promise<boolean>((r) => {
			const closeModal = this.modal();
			const panel = new Spr9('panel');
			const destroy = async () => {
				tweens.forEach((i) => TweenManager.abort(i));
				tweens.length = 0;
				closeModal();
				tweens.push(...this.transitionOut(panel, 150));
				await delay(300);
				tweens.forEach((i) => TweenManager.abort(i));
				panel.destroy();
				btnConfirm.destroy();
				btnCancel.destroy();
			};
			const btnConfirm = new BtnText(confirm, () => {
				destroy();
				r(true);
			});
			const btnCancel = new BtnText(cancel, () => {
				destroy();
				r(false);
			});
			btnCancel.display.container.scale.x *= -1;
			btnCancel.text.scale.x *= -1;
			btnCancel.text.x += btnCancel.text.width;
			btnCancel.display.container.alpha = 0.8;

			panel.width = size.x / 3 - 50;
			const gap = 25;
			const textMsg = new BitmapText({ text: '', style: fontDialogue });
			textMsg.style.wordWrapWidth = panel.width - gap * 2;
			textMsg.style.align = 'center';
			setTextWrapped(textMsg, msg);
			panel.x -= panel.width / 2;
			textMsg.x += gap;
			textMsg.x += (textMsg.style.wordWrapWidth - textMsg.width) / 2;
			textMsg.y += gap;
			btnConfirm.transform.x -=
				btnConfirm.display.container.width / 2 + gap / 2;
			btnCancel.transform.x += btnConfirm.display.container.width / 2 + gap / 2;
			btnConfirm.transform.x += panel.width / 2;
			btnCancel.transform.x += panel.width / 2;
			btnConfirm.transform.y += textMsg.height + gap * 3;
			btnCancel.transform.y += textMsg.height + gap * 3;
			panel.height =
				textMsg.height + btnCancel.display.container.height + gap * 3;
			panel.y -= panel.height / 2;

			this.containerUI.addChild(panel);
			panel.addChild(textMsg);
			panel.addChild(btnConfirm.display.container);
			panel.addChild(btnCancel.display.container);

			const tweens: Tween[] = [];
			tweens.push(...this.transitionIn(panel, 150));
		});
	}

	alert(msg: string, confirm = 'OK', tint = red) {
		return new Promise<boolean>((r) => {
			const closeModal = this.modal();
			const panel = new Spr9('panel');
			const destroy = async () => {
				tweens.forEach((i) => TweenManager.abort(i));
				tweens.length = 0;
				closeModal();
				tweens.push(...this.transitionOut(panel, 150));
				await delay(300);
				tweens.forEach((i) => TweenManager.abort(i));
				panel.destroy();
				btnConfirm.destroy();
			};
			const btnConfirm = new BtnText(confirm, () => {
				destroy();
				r(true);
			});

			panel.width = size.x / 3 - 50;
			const gap = 25;
			const textMsg = new BitmapText({ text: '', style: fontDialogue });
			textMsg.style.wordWrapWidth = panel.width - gap * 2;
			textMsg.style.align = 'center';
			setTextWrapped(textMsg, msg);
			panel.x -= panel.width / 2;
			textMsg.x += gap;
			textMsg.x += (textMsg.style.wordWrapWidth - textMsg.width) / 2;
			textMsg.y += gap;
			btnConfirm.transform.x += panel.width / 2;
			btnConfirm.transform.y += textMsg.height + gap * 3;
			panel.height =
				textMsg.height + btnConfirm.display.container.height + gap * 3;
			panel.y -= panel.height / 2;

			this.containerUI.addChild(panel);
			panel.addChild(textMsg);
			panel.addChild(btnConfirm.display.container);

			panel.tint = tint;

			const tweens: Tween[] = [];
			tweens.push(...this.transitionIn(panel, 150));
		});
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
PRICE:  ${formatCount(cost, costMax)}
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
			-size.x / 3 + this.mech.container.x + cellSize / 2,
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
					spr.addEventListener('pointerover', () => {
						this.textTip.text = part.name;
					});
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

			// safety check on mech sizes
			if (DEBUG) {
				const tallestHead = this.pieces.heads
					.slice()
					.sort((a, b) => this.getPart(b).h - this.getPart(a).h)[0];
				const tallestHeadD = this.getPart(tallestHead);
				const tallestChest = this.pieces.chests
					.slice()
					.sort((a, b) => this.getPart(b).h - this.getPart(a).h)[0];
				const tallestChestD = this.getPart(tallestChest);
				const tallestLegs = this.pieces.legs
					.slice()
					.sort((a, b) => this.getPart(b).h - this.getPart(a).h)[0];
				const tallestLegsD = this.getPart(tallestLegs);
				const widestChest = this.pieces.chests
					.slice()
					.sort((a, b) => this.getPart(b).w - this.getPart(a).w)[0];
				const widestChestD = this.getPart(widestChest);
				const widestArms = this.pieces.arms
					.slice()
					.sort((a, b) => this.getPart(b).w - this.getPart(a).w)[0];
				const widestArmsD = this.getPart(widestArms);

				const tallest = tallestHeadD.h + tallestChestD.h + tallestLegsD.h;
				const widest = widestChestD.w + widestArmsD.w;
				if (tallest > 32) {
					await this.alert(
						`tallest: ${tallestHead} (${tallestHeadD.h}) + ${tallestChest} (${tallestChestD.h}) + ${tallestLegs} (${tallestLegsD.h}) = ${tallest}`
					);
				}
				if (widest > 15) {
					await this.alert(
						`widest: ${widestChest} (${widestChestD.w}) + ${widestArms} (${widestArmsD.w}) = ${widest}`
					);
				}
			}
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
			size.x / 3 + this.mech.container.x - cellSize / 2,
			undefined,
			500,
			eases.cubicInOut
		);
		return new Promise<boolean>(async (donePlacingModules) => {
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
 
${lastModule.description}${
						DEBUG ? `\n \nDEBUG TAGS: ${lastModule.tags.join(', ')}` : ''
					}`)}`
				);
			};

			const {
				container: containerBtns,
				gridBtns,
				gridBtnsByPos,
			} = this.makeBtnGrid('player', (btn, x, y, cell) => {
				if (cell === '=') {
					btn.texture = 'cell joint';
					btn.spr.texture = tex(btn.texture);
				}
				btn.onClick = (event) => {
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
						updateInfo();
					}
				};
				btn.spr.addEventListener('pointerover', () => {
					target = btn;
					checkPlacement();
					const idx = Number(this.modules.grid[y][x]);
					if (Number.isNaN(idx)) {
						this.textTip.text =
							this.mech.grid[y][x] === '=' ? 'joint' : 'empty cell';
						return;
					}
					this.textTip.text = this.modules.placed[idx].module.name;
					if (!dragging) {
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
					if (btn !== target && btn.texture === 'cell button')
						btn.spr.texture = tex('cell button_normal');
				});
				if (!dragging) return;
				if (!target) return;
				valid = true;
				const [x, y] = target.spr.label.split(',').map((i) => Number(i));

				const moduleD = modulesByName[dragging.label];
				const draggingCells = rotateCellsByDisplay(moduleD.cells, dragging);

				const { turns, flipH, flipV } = displayToPlacementProps(dragging);
				const o = moduleD.pivot.slice();
				if (flipH) {
					o[0] = moduleD.w - o[0] - 1;
				}
				if (flipV) {
					o[1] = moduleD.h - o[1] - 1;
				}
				const p = o.slice();
				if (turns === 1) {
					o[0] = moduleD.h - p[1] - 1;
					o[1] = p[0];
				} else if (turns === 2) {
					o[0] = moduleD.w - p[0] - 1;
					o[1] = moduleD.h - p[1] - 1;
				} else if (turns === 3) {
					o[0] = p[1];
					o[1] = moduleD.w - p[0] - 1;
				}
				forCells(draggingCells, (x2, y2) => {
					const modulecell = this.modules.grid[y + y2 - o[1]]?.[x + x2 - o[0]];
					if (modulecell !== 'x') valid = false;
				});

				forCells(draggingCells, (x2, y2) => {
					const btnNeighbour = gridBtnsByPos[y + y2 - o[1]]?.[x + x2 - o[0]];
					if (!btnNeighbour) return;
					btnNeighbour.spr.tint = valid ? green : red;
					if (btnNeighbour !== target && btnNeighbour.texture === 'cell button')
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
				if (input.flipC) {
					if (displayToPlacementProps(dragging).turns % 2) {
						dragging.scale.x *= -1;
						checkPlacement();
					} else {
						dragging.scale.y *= -1;
						checkPlacement();
					}
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
				width: size.x / 3,
				height: size.y,
				gap: 10,
			});
			const sprPadding = new Sprite(tex('blank'));
			sprPadding.height = this.panelTip.height;
			scroller.addChild(sprPadding);
			modules.forEach((moduleD) => {
				const uiModule = makeModule(moduleD);
				uiModule.y += moduleD.pivot[1] * cellSize;
				uiModule.x += moduleD.pivot[0] * cellSize;
				const c = new Container();
				c.addChild(uiModule);
				scroller.addChild(c);
				buttonify(uiModule, moduleD.name);
				uiModule.addEventListener('pointerover', () => {
					this.textTip.text = moduleD.name;
				});
				uiModule.addEventListener('pointerdown', (event) => {
					if (event && event.button !== mouse.LEFT) return;
					if (dragging) dragging.destroy();
					dragging = startDragging(moduleD);
				});
			});
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

			const destroy = async () => {
				document.removeEventListener('contextmenu', onContext);
				dragging?.destroy();
				removeFromArray(this.camera.scripts, dragger);

				const tweens: Tween[] = [];
				tweens.push(...this.transitionOut(panelInfo, 300));
				tweens.push(...this.transitionOut(containerScrollers, 200));
				await delay(300);
				tweens.forEach((i) => TweenManager.abort(i));

				panelInfo.destroy();
				btnDone.destroy();
				btnBack.destroy();
				btnReset.destroy();
				scroller.destroy();
				gridBtns.forEach((i) => i.destroy());
			};
			const btnBack = new BtnText('BACK', async () => {
				if (
					this.modules.placed.length &&
					!(await this.confirm(
						'Go back to part selection? This will remove all currently placed modules.'
					))
				)
					return;
				destroy();
				this.screenFilter.flash(0.3, 400, eases.circOut);
				donePlacingModules(false);
			});
			const btnReset = new BtnText('RESET', async () => {
				if (
					this.modules.placed.length &&
					!(await this.confirm('Remove all currently placed modules?'))
				)
					return;
				this.modules.placed = [];
				this.reassemble();
				this.screenFilter.flash(0.3, 200, eases.circOut);
			});
			const btnDone = new BtnText('DONE', () => {
				// who needs raw data when you have formatted text
				if (this.getGeneralInfo().includes('!!!')) {
					this.alert('INSUFFICIENT FUNDS');
					return;
				}
				if (
					!this.modules.placed.some((i) => i.module.tags.includes('cockpit'))
				) {
					this.alert('NO COCKPIT DETECTED');
					return;
				}
				destroy();
				this.screenFilter.flash(0.5, 500, eases.circOut);
				donePlacingModules(true);
			});

			const containerScrollers = new Container();
			this.container.addChild(containerBtns);
			this.container.addChild(containerScrollers);
			containerScrollers.addChild(scroller.container);
			containerScrollers.x = size.x / 3 - tex('scroll_thumb').width;
			this.containerUI.addChild(panelInfo);
			panelInfo.addChild(btnDone.display.container);
			panelInfo.addChild(btnBack.display.container);
			panelInfo.addChild(btnReset.display.container);
			btnDone.transform.x += 350;
			btnDone.transform.x -= btnDone.display.container.width / 2;
			btnDone.transform.y += size.x / 2;
			btnDone.transform.y -= btnDone.display.container.height / 2;

			btnReset.transform.x = btnDone.transform.x;
			btnReset.transform.y = btnDone.transform.y;
			btnReset.transform.y -= btnDone.display.container.height;

			btnBack.transform.x += 350;
			btnBack.transform.x -= btnBack.display.container.width / 2;
			btnBack.transform.y += size.x / 2;
			btnBack.transform.y -= btnBack.display.container.height / 2;
			btnBack.transform.x -= btnDone.display.container.width + 10;
			btnBack.display.container.scale.x *= -1;
			btnBack.text.scale.x *= -1;
			btnBack.text.x += btnBack.text.width;

			updateInfo();
			this.reassemble();

			const closeModal = this.modal(0);
			panelInfo.visible = false;
			containerScrollers.visible = false;
			await delay(150);
			panelInfo.visible = true;
			containerScrollers.visible = true;
			this.transitionIn(panelInfo, 400);
			this.transitionIn(containerScrollers, 500);
			await delay(500);
			closeModal();
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
		this.modules = this.assembleModules(
			this.mech.grid,
			this.modules?.placed || []
		);
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
		this.modulesEnemy = this.assembleModules(
			this.mechEnemy.grid,
			this.modulesEnemy?.placed || []
		);
		this.container.addChildAt(this.mechEnemy.container, 0);
		this.container.addChild(this.modulesEnemy.container);
		this.mechEnemy.container.children.forEach((i) => {
			if (i.children.length) i.visible = false;
		});

		this.mech.container.x -= Math.floor(
			Math.max(size.x * (1 / 5), this.mech.container.width / 2) + 50
		);
		this.mech.container.y += size.y * 0.45;
		this.mechEnemy.container.x += Math.floor(
			Math.max(size.x * (1 / 5), this.mechEnemy.container.width / 2) + 50
		);
		this.mechEnemy.container.y += size.y * 0.45;
		this.mechEnemy.container.visible = this.battleGridEnemy.length > 0;

		this.modules.container.x = this.mech.container.x;
		this.modules.container.y = this.mech.container.y;
		this.modules.container.x += this.mech.gridDimensions.x * cellSize;
		this.modules.container.y += this.mech.gridDimensions.y * cellSize;

		this.modulesEnemy.container.x = this.mechEnemy.container.x;
		this.modulesEnemy.container.y = this.mechEnemy.container.y;
		this.modulesEnemy.container.x += this.mechEnemy.gridDimensions.x * cellSize;
		this.modulesEnemy.container.y += this.mechEnemy.gridDimensions.y * cellSize;

		this.damageBtns?.container.destroy();
		this.damageBtns?.gridBtns.forEach((i) => i.destroy());
		if (this.battleGrid.length) {
			this.damageBtns = this.makeBtnGrid('player', (btn, x, y, cell) => {
				const idx = Number(this.modules.grid[y][x]);
				const hasModule = !Number.isNaN(idx);
				const isJoint = this.mech.grid[y][x] === '=';
				const isEmpty = !isJoint && !hasModule;
				const isDestroyed = this.battleGrid[y][x] === 'X';
				const isRevealed = this.battleGrid[y][x] === 'O';
				const isFullyDestroyed =
					isDestroyed &&
					((hasModule &&
						this.moduleIsDestroyed(
							this.modules.placed[idx],
							this.battleGrid
						)) ||
						isJoint);
				const isFullyRevealed =
					isRevealed &&
					((hasModule &&
						this.moduleIsRevealed(this.modules.placed[idx], this.battleGrid)) ||
						isJoint);
				const name = hasModule
					? this.modules.placed[idx].module.name
					: isJoint
					? 'joint'
					: 'empty';
				if (isFullyDestroyed) {
					if (isJoint) {
						btn.spr.texture = tex('cell joint');
						btn.spr.tint = red;
					} else {
						btn.display.container.alpha = 0;
					}
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = `${name} (destroyed)`;
					});
				} else if (isFullyRevealed) {
					if (isJoint) {
						btn.spr.texture = tex('cell joint');
						btn.spr.tint = green;
					} else {
						btn.display.container.alpha = 0;
					}
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = `${name} (revealed)`;
					});
				} else if (isDestroyed) {
					btn.spr.texture = tex(isEmpty ? 'cell detect_empty' : 'cell damaged');
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = isEmpty
							? 'empty cell (revealed)'
							: `${name} (damaged)`;
					});
					btn.spr.tint = isEmpty ? gray : redHalf;
				} else if (isRevealed) {
					btn.spr.texture = tex(
						isEmpty ? 'cell detect_empty' : 'cell detect_filled'
					);
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = isEmpty
							? 'empty cell (revealed)'
							: `${name} (revealed)`;
					});
					btn.spr.tint = isEmpty ? gray : greenHalf;
				} else {
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = isEmpty
							? 'empty cell (hidden)'
							: `${name} (hidden)`;
					});
					btn.spr.alpha = 0;
				}
			});
			this.container.addChild(this.damageBtns.container);
			this.modules.placed.forEach((i, idx) => {
				if (this.moduleIsDestroyed(i, this.battleGrid)) {
					this.modules.container.children[idx].tint = red;
				} else if (this.moduleIsRevealed(i, this.battleGrid)) {
					this.modules.container.children[idx].tint = green;
				}
			});
		}
		this.damageBtnsEnemy?.container.destroy();
		this.damageBtnsEnemy?.gridBtns.forEach((i) => i.destroy());
		if (this.battleGridEnemy.length) {
			this.damageBtnsEnemy = this.makeBtnGrid('enemy', (btn, x, y, cell) => {
				const idx = Number(this.modulesEnemy.grid[y][x]);
				const hasModule = !Number.isNaN(idx);
				const isJoint = this.mechEnemy.grid[y][x] === '=';
				const isEmpty = !isJoint && !hasModule;
				const isDestroyed = this.battleGridEnemy[y][x] === 'X';
				const isRevealed = this.battleGridEnemy[y][x] === 'O';
				const isFullyDestroyed =
					isDestroyed &&
					((hasModule &&
						this.moduleIsDestroyed(
							this.modulesEnemy.placed[idx],
							this.battleGridEnemy
						)) ||
						isJoint);
				const isFullyRevealed =
					isRevealed &&
					((hasModule &&
						this.moduleIsRevealed(
							this.modulesEnemy.placed[idx],
							this.battleGridEnemy
						)) ||
						isJoint);
				const name = hasModule
					? this.modulesEnemy.placed[idx].module.name
					: isJoint
					? 'joint'
					: 'empty';
				if (isFullyDestroyed) {
					if (isJoint) {
						btn.spr.texture = tex('cell joint');
						btn.spr.tint = red;
					} else {
						btn.display.container.alpha = 0;
					}
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = `${name} (destroyed)`;
					});
				} else if (isFullyRevealed) {
					if (isJoint) {
						btn.spr.texture = tex('cell joint');
						btn.spr.tint = green;
					} else {
						btn.display.container.alpha = 0;
					}
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = `${name} (scanned)`;
					});
				} else if (isDestroyed) {
					btn.spr.texture = tex(isEmpty ? 'cell detect_empty' : 'cell damaged');
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = isEmpty ? 'empty cell' : 'part damaged';
					});
					btn.spr.tint = isEmpty ? gray : redHalf;
				} else if (isRevealed) {
					btn.spr.texture = tex(
						isEmpty ? 'cell detect_empty' : 'cell detect_filled'
					);
					btn.spr.addEventListener('pointerover', () => {
						this.textTip.text = isEmpty ? 'empty cell' : `${name} (scanned)`;
					});
					btn.spr.tint = isEmpty ? gray : greenHalf;
				} else {
					btn.display.container.visible = false;
				}
			});
			this.container.addChild(this.damageBtnsEnemy.container);
			this.modulesEnemy.placed.forEach((i, idx) => {
				if (this.moduleIsDestroyed(i, this.battleGridEnemy)) {
					this.modulesEnemy.container.children[idx].visible = true;
					this.modulesEnemy.container.children[idx].tint = red;
				} else if (this.moduleIsRevealed(i, this.battleGridEnemy)) {
					this.modulesEnemy.container.children[idx].visible = true;
					this.modulesEnemy.container.children[idx].tint = green;
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
		gridParts: string[][];
		connections: {
			[key in 'head' | 'armL' | 'armR' | 'legL' | 'legR']: [number, number];
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

		const partCellHead = replaceCells(headD.cells, '0', 'H');
		const partCellChest = replaceCells(chestD.cells, '0', 'C');
		const partCellArmL = replaceCells(armLD.cells, '0', 'AL');
		const partCellArmR = replaceCells(armRD.cells, '0', 'AR');
		const partCellLegL = replaceCells(legLD.cells, '0', 'LL');
		const partCellLegR = replaceCells(legRD.cells, '0', 'LR');
		partCellChest[chestD.connections.head[1]][chestD.connections.head[0]] =
			'JH';
		partCellChest[chestD.connections.legL[1]][chestD.connections.legL[0]] =
			'JLL';
		partCellChest[chestD.connections.legR[1]][chestD.connections.legR[0]] =
			'JLR';
		partCellChest[chestD.connections.armL[1]][chestD.connections.armL[0]] =
			'JAL';
		partCellChest[chestD.connections.armR[1]][chestD.connections.armR[0]] =
			'JAR';
		const [gridParts] = flatten([
			{
				cells: partCellChest,
				x: cellsChest.position.x / cellSize,
				y: cellsChest.position.y / cellSize,
			},
			{
				cells: partCellHead,
				x: cellsHead.position.x / cellSize,
				y: cellsHead.position.y / cellSize,
			},
			{
				cells: partCellLegL,
				x: cellsLegL.position.x / cellSize,
				y: cellsLegL.position.y / cellSize,
			},
			{
				cells: partCellLegR,
				x: cellsLegR.position.x / cellSize,
				y: cellsLegR.position.y / cellSize,
			},
			{
				cells: partCellArmL,
				x: cellsArmL.position.x / cellSize,
				y: cellsArmL.position.y / cellSize,
			},
			{
				cells: partCellArmR,
				x: cellsArmR.position.x / cellSize,
				y: cellsArmR.position.y / cellSize,
			},
		]);

		const connections: ReturnType<GameScene['assembleParts']>['connections'] = {
			head: [0, 0],
			armL: [0, 0],
			armR: [0, 0],
			legL: [0, 0],
			legR: [0, 0],
		};
		forCells(gridParts, (x, y, cell) => {
			if (cell === 'JH') connections.head = [x, y];
			if (cell === 'JLL') connections.legL = [x, y];
			if (cell === 'JLR') connections.legR = [x, y];
			if (cell === 'JAL') connections.armL = [x, y];
			if (cell === 'JAR') connections.armR = [x, y];
		});

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
			gridParts,
			connections,
		};
	}

	assembleModules(
		mechGrid: string[][],
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
		placed: Parameters<GameScene['assembleModules']>[1];
		grid: string[][];
	} {
		const container: Container = new Container();
		placed.forEach((i) => {
			const sprModule = makeModule(i.module);
			sprModule.rotation = (i.turns / 4) * Math.PI * 2;
			sprModule.x = (i.x + 0.5) * cellSize;
			sprModule.y = (i.y + 0.5) * cellSize;
			sprModule.scale.x = i.flipH ? -1 : 1;
			sprModule.scale.y = i.flipV ? -1 : 1;
			container.addChild(sprModule);
		});

		const [grid] = flatten([
			{
				cells: replaceCells(
					replaceCells(mechGrid || [], /[^0]/, '-'),
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
		const o = i.module.pivot.slice();
		if (i.flipH) {
			o[0] = i.module.w - o[0] - 1;
		}
		if (i.flipV) {
			o[1] = i.module.h - o[1] - 1;
		}
		const p = o.slice();
		if (i.turns === 1) {
			o[0] = i.module.h - p[1] - 1;
			o[1] = p[0];
		} else if (i.turns === 2) {
			o[0] = i.module.w - p[0] - 1;
			o[1] = i.module.h - p[1] - 1;
		} else if (i.turns === 3) {
			o[0] = p[1];
			o[1] = i.module.w - p[0] - 1;
		}
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
		let destroyed = true;
		this.forPlacedModuleCells(module, (x, y) => {
			if (!destroyed) return;
			if (cells[y]?.[x] !== 'X') destroyed = false;
		});
		return destroyed;
	}

	moduleIsRevealed(
		module: GameScene['modules']['placed'][number],
		cells: string[][]
	) {
		let revealed = true;
		this.forPlacedModuleCells(module, (x, y) => {
			if (!revealed) return;
			const cell = cells[y]?.[x];
			if (cell !== 'X' && cell !== 'O') revealed = false;
		});
		return revealed;
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

		let shieldsEnemy = 0;

		do {
			await this.pickActions();
			const log: string[] = [];
			log.push(...(await this.playOverheat()));
			let lost = !this.modules.placed.some(
				(i) =>
					i.module.tags.includes('cockpit') &&
					!this.moduleIsDestroyed(i, this.battleGrid)
			);
			if (lost) {
				this.strand.won = false;
			} else {
				log.push(...(await this.playActions(shieldsEnemy)));
			}
			const won = !this.modulesEnemy.placed.some(
				(i) =>
					i.module.tags.includes('cockpit') &&
					!this.moduleIsDestroyed(i, this.battleGridEnemy)
			);

			await this.alert(
				`
TURN ${turnCount}
 
OVERHEATED: ${log.filter((i) => i === 'OVERHEATED').length}
SHIELDED: ${log.filter((i) => i === 'SHIELDED').length}
HIT: ${log.filter((i) => i === 'HIT').length}
REVEALED: ${log.filter((i) => i === 'REVEALED').length}
MISS: ${log.filter((i) => i === 'MISS').length}
`,
				lost ? 'LOSS' : won ? 'WIN' : 'NEXT',
				lost ? red : won ? green : greenHalf
			);
			if (won) {
				this.strand.won = true;
			}

			if (won || lost) return;

			++turnCount;
			log.length = 0;

			const enemyResult = await this.enemyActions();
			log.push(...enemyResult.log);
			shieldsEnemy = enemyResult.shields;

			lost = !this.modules.placed.some(
				(i) =>
					i.module.tags.includes('cockpit') &&
					!this.moduleIsDestroyed(i, this.battleGrid)
			);

			await this.alert(
				`
TURN ${turnCount}
 
OVERHEATED: ${log.filter((i) => i === 'OVERHEATED').length}
SHIELDED: ${log.filter((i) => i === 'SHIELDED').length}
HIT: ${log.filter((i) => i === 'HIT').length}
REVEALED: ${log.filter((i) => i === 'REVEALED').length}
MISS: ${log.filter((i) => i === 'MISS').length}
`,
				lost ? 'LOSS' : 'NEXT',
				lost ? red : redHalf
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
		scans: [number, number][];
		heatMax: number;
	} = {
		shield: 0,
		attacks: [],
		scans: [],
		heatMax: 0,
	};

	tagsToPossibleActions(tags: string[]) {
		let attacksMax = 0;
		let scansMax = 0;
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
				case 'radar':
					++scansMax;
					break;
				case 'shield':
					++shieldsAmt;
					break;
			}
		});
		return { attacksMax, scansMax, shieldsAmt, heatMax };
	}

	pickActions() {
		return new Promise<void>((r) => {
			// reset
			this.actions.shield = 0;
			this.actions.attacks = [];
			this.actions.scans = [];

			const {
				container: containerBtns,
				gridBtns,
				gridBtnsByPos,
			} = this.makeBtnGrid('enemy', (btn, x, y) => {
				btn.spr.texture = tex('cell target');
				btn.display.container.tint = red;
				btn.spr.addEventListener('pointerover', () => {
					this.textTip.text =
						btn.display.container.tint === red ? 'QUEUED AIM' : 'QUEUED SCAN';
				});
			});

			this.container.addChild(containerBtns);
			const tags = this.modules.placed
				.filter((i) => !this.moduleIsDestroyed(i, this.battleGrid))
				.flatMap((i) => i.module.tags);
			const { attacksMax, scansMax, shieldsAmt, heatMax } =
				this.tagsToPossibleActions(tags);
			this.actions.heatMax = heatMax;

			const containerHeat = new Container();
			buttonify(containerHeat);
			containerHeat.addEventListener('pointerover', () => {
				this.textTip.text = `HEAT: ${formatCount(this.getHeat(), heatMax)}`;
			});
			const heatTweens: Tween[] = [];
			const updateHeat = () => {
				heatTweens.forEach((i) => TweenManager.abort(i));
				heatTweens.length = 0;
				containerHeat.children.forEach((i) => {
					i.destroy({ children: true });
					containerHeat.removeChild(i);
				});
				containerHeat.children.length = 0;
				containerHeat.scale.y = 1;
				const heat = this.getHeat();
				for (let i = 0; i < Math.max(heat, heatMax); ++i) {
					const textCount = new BitmapText({
						text: (i + 1).toString(10),
						style: fontMechInfo,
					});
					const textCount2 = new BitmapText({
						text: (i + 1).toString(10),
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
					textCount2.x -= sprHeatBg.width / 2 + 2;
					textCount2.x -= textCount.width - 1;
					textCount2.y += sprHeatBg.height / 2;
					textCount.x = Math.floor(textCount.x);
					textCount2.x = Math.floor(textCount2.x);
					textCount.y = Math.floor(textCount.y);
					textCount2.y = Math.floor(textCount2.y);
					sprHeatBg.addChild(textCount);
					sprHeatBg.addChild(textCount);
					sprHeatBg.addChild(textCount2);
					containerHeat.addChild(sprHeatBg);
					heatTweens.push(...this.transitionIn(sprHeatBg, i * 50));
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
					heatTweens.push(...this.transitionIn(sprHeatFill, i * 50));
				}
				while (-containerHeat.y + containerHeat.height > size.y / 2) {
					containerHeat.scale.y *= 0.9;
				}
				if (heat > 0) {
					btnReset.display.container.tint = white;
				} else {
					btnReset.display.container.tint = gray;
				}
			};

			const updateTargetGrid = () => {
				gridBtns.forEach((i) => {
					i.display.container.visible = false;
				});
				this.actions.attacks.forEach((i) => {
					const btn = gridBtnsByPos[i[1]]?.[i[0]];
					if (!btn) return;
					btn.display.container.visible = true;
					btn.display.container.tint = red;
				});
				this.actions.scans.forEach((i) => {
					const btn = gridBtnsByPos[i[1]]?.[i[0]];
					if (!btn) return;
					btn.display.container.visible = true;
					btn.display.container.tint = green;
				});
			};

			const updateAttacks = () => {
				btnAttack.setText(`AIM\n(${attacksMax - this.actions.attacks.length})`);
				if (this.actions.attacks.length < attacksMax) {
					btnAttack.display.container.tint = green;
				} else {
					btnAttack.display.container.tint = red;
				}
			};

			const btnAttack = new BtnText(
				'AIM',
				async (e) => {
					if (this.actions.attacks.length >= attacksMax) return;
					const removeModal = this.modal(undefined, red);
					const target = await this.pickTarget(true);
					removeModal();
					if (!target) return;
					this.actions.attacks.push([target[0], target[1]]);
					updateAttacks();
					updateTargetGrid();
					updateHeat();
					if (target[2]) btnAttack.onClick(e);
				},
				undefined,
				'buttonCombat'
			);

			const updateScans = () => {
				btnScan.setText(`SCAN\n (${scansMax - this.actions.scans.length})`);
				if (this.actions.scans.length < scansMax) {
					btnScan.display.container.tint = green;
				} else {
					btnScan.display.container.tint = red;
				}
			};

			const btnScan = new BtnText(
				'SCAN',
				async (e) => {
					if (this.actions.scans.length >= scansMax) return;
					const removeModal = this.modal(undefined, greenHalf);
					const target = await this.pickTarget(false);
					removeModal();
					if (!target) return;
					this.actions.scans.push([target[0], target[1]]);
					updateScans();
					updateTargetGrid();
					updateHeat();
					if (target[2]) btnScan.onClick(e);
				},
				undefined,
				'buttonCombat'
			);

			const updateShields = () => {
				if (shieldsAmt) {
					btnToggleShield.setText(
						this.actions.shield
							? `SHIELD\n ${Math.floor(shieldsAmt * 100)}%`
							: 'SHIELD\n OFF'
					);
					btnToggleShield.display.container.tint = this.actions.shield
						? green
						: gray;
				} else {
					btnToggleShield.setText('SHIELD\n  0%');
					btnToggleShield.display.container.tint = red;
				}
			};
			const btnToggleShield = new BtnText(
				'shields',
				() => {
					this.actions.shield = this.actions.shield ? 0 : shieldsAmt;
					updateShields();
					updateHeat();
				},
				'toggle shields',
				'buttonCombat'
			);

			const btnReset = new BtnText(
				'RESET',
				() => {
					this.screenFilter.flash(0.3, 400, eases.circOut);
					this.actions.attacks.length = 0;
					this.actions.scans.length = 0;
					this.actions.shield = 0;
					updateAttacks();
					updateScans();
					updateShields();
					updateTargetGrid();
					updateHeat();
				},
				'reset actions',
				'buttonCombat'
			);

			const btnEnd = new BtnText(
				'CONFIRM',
				async () => {
					if (
						!this.actions.shield &&
						!this.actions.scans.length &&
						!this.actions.attacks.length &&
						!(await this.confirm('Skip your turn?'))
					)
						return;
					destroy();
					r();
				},
				undefined,
				'buttonCombat'
			);

			btnEnd.transform.y +=
				size.y / 2 - btnEnd.display.container.height / 2 - 5;
			this.containerUI.addChild(btnEnd.display.container);

			btnToggleShield.transform.y =
				btnEnd.transform.y - btnEnd.display.container.height;
			this.containerUI.addChild(btnToggleShield.display.container);

			btnScan.transform.y =
				btnToggleShield.transform.y - btnToggleShield.display.container.height;
			this.containerUI.addChild(btnScan.display.container);

			btnAttack.transform.y =
				btnScan.transform.y - btnScan.display.container.height;
			this.containerUI.addChild(btnAttack.display.container);

			btnReset.transform.y =
				btnAttack.transform.y - btnAttack.display.container.height;
			this.containerUI.addChild(btnReset.display.container);

			this.containerUI.addChild(containerHeat);
			containerHeat.y =
				btnReset.transform.y - btnReset.display.container.height;

			const destroy = async () => {
				const closeModal = this.modal(0);
				const tweens = [
					...this.transitionOut(containerHeat, 200),
					...this.transitionOut(btnReset.display.container, 300),
					...this.transitionOut(btnAttack.display.container, 400),
					...this.transitionOut(btnScan.display.container, 500),
					...this.transitionOut(btnToggleShield.display.container, 600),
					...this.transitionOut(btnEnd.display.container, 700),
				];
				await delay(700);
				tweens.forEach((i) => TweenManager.abort(i));
				heatTweens.forEach((i) => TweenManager.abort(i));

				containerHeat.destroy();
				btnAttack.destroy();
				btnScan.destroy();
				btnReset.destroy();
				btnToggleShield.destroy();
				btnEnd.destroy();
				gridBtns.forEach((i) => i.destroy());
				containerBtns.destroy();
				closeModal();
			};

			updateAttacks();
			updateScans();
			updateShields();
			updateTargetGrid();
			updateHeat();

			this.transitionIn(containerHeat, 200);
			this.transitionIn(btnAttack.display.container, 300);
			this.transitionIn(btnReset.display.container, 400);
			this.transitionIn(btnToggleShield.display.container, 500);
			this.transitionIn(btnEnd.display.container, 600);
		});
	}

	pickTarget(includeRevealed: boolean) {
		return new Promise<[number, number, boolean] | false>((r) => {
			const { container: containerBtns, gridBtns } = this.makeBtnGrid(
				'enemy',
				(btn, x, y) => {
					if (
						this.battleGridEnemy[y][x] === 'X' ||
						(!includeRevealed && this.battleGridEnemy[y][x] === 'O') ||
						this.actions.attacks.some((i) => i[0] === x && i[1] === y) ||
						this.actions.scans.some((i) => i[0] === x && i[1] === y)
					) {
						btn.enabled = false;
						btn.display.container.visible = false;
						return;
					}
					btn.onClick = (event) => {
						destroy();
						r([x, y, event.ctrlKey || event.shiftKey]);
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
		return (
			this.actions.attacks.length +
			this.actions.scans.length +
			this.actions.shield
		);
	}

	async overheat(who: 'player' | 'enemy') {
		const [placed, grid] =
			who === 'player'
				? [this.modules.placed, this.battleGrid]
				: [this.modulesEnemy.placed, this.battleGridEnemy];
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
		let msg = false;
		this.forPlacedModuleCells(target, (x, y) => {
			grid[y][x] = 'X';
			if (!msg) {
				msg = true;
				this.zoop(who, x, y, red, 'OVERHEATED');
			}
		});
		this.reassemble();
	}

	async attack(
		who: 'player' | 'enemy',
		{
			attacks,
			shields,
		}: {
			attacks: [number, number][];
			shields: number;
		}
	) {
		if (!attacks.length) return [];

		const log: string[] = [];
		const grid = who === 'player' ? this.battleGrid : this.battleGridEnemy;
		const mech = who === 'player' ? this.mech : this.mechEnemy;
		const modules = who === 'player' ? this.modules : this.modulesEnemy;

		let shieldContainer: Container;
		let shieldTween: Tween | null = null;
		let destroyShield = () => {};
		if (shields > 0) {
			const { container, gridBtns } = this.makeBtnGrid(who, (btn) => {
				btn.enabled = false;
				btn.display.container.tint = blueHalf;
				btn.spr.scale.x *= 2;
				btn.spr.scale.y *= 2;
				btn.spr.texture = tex('cell shield');
			});
			shieldContainer = container;
			shieldTween = TweenManager.tween(
				container,
				'alpha',
				0.2,
				500,
				0,
				eases.cubicInOut
			);
			this.containerUI.addChild(container);
			destroyShield = async () => {
				destroyShield = () => {};
				if (shieldTween) TweenManager.abort(shieldTween);
				shieldTween = TweenManager.tween(
					shieldContainer,
					'alpha',
					0,
					500,
					0.7,
					eases.circOut
				);
				await delay(500);
				TweenManager.abort(shieldTween);
				container.destroy();
				gridBtns.forEach((i) => i.destroy());
			};
			await delay(500);
		}

		for (let [x, y] of attacks) {
			await delay(100);
			let msg = 'SHIELDED';
			if (shields-- > 0) {
				// TODO: hit shield feedback
				await this.zoop(who, x, y, red, msg);
				log.push(msg);

				if (shields <= 0) {
					shieldContainer.tint = redHalf;
					destroyShield();
				} else {
					if (shieldTween) TweenManager.abort(shieldTween);
					shieldTween = TweenManager.tween(
						shieldContainer,
						'alpha',
						0.2,
						500,
						0.7,
						eases.circOut
					);
				}
				continue;
			}
			// TODO: hit feedback
			const idx = Number(modules.grid[y][x]);
			const hasModule = !Number.isNaN(idx);
			const isJoint = mech.grid[y][x] === '=';
			msg = hasModule || isJoint ? 'HIT' : 'MISS';
			await this.zoop(who, x, y, red, msg);
			log.push(msg);
			grid[y][x] = 'X';
			this.reassemble();
		}
		destroyShield();
		return log;
	}

	async scan(who: 'player' | 'enemy', scans: [number, number][]) {
		if (!scans.length) return [];

		const log: string[] = [];
		const grid = who === 'player' ? this.battleGrid : this.battleGridEnemy;
		const mech = who === 'player' ? this.mech : this.mechEnemy;
		const modules = who === 'player' ? this.modules : this.modulesEnemy;
		for (let [x, y] of scans) {
			await delay(100);
			// TODO: scan feedback
			const idx = Number(modules.grid[y][x]);
			const hasModule = !Number.isNaN(idx);
			const isJoint = mech.grid[y][x] === '=';
			const msg = hasModule || isJoint ? 'REVEALED' : 'MISS';
			log.push(msg);
			await this.zoop(who, x, y, green, msg);
			grid[y][x] = hasModule || isJoint ? 'O' : 'X';
			this.reassemble();
		}
		return log;
	}

	async severParts(who: 'player' | 'enemy') {
		const [mech, modules, grid] =
			who === 'player'
				? [this.mech, this.modules, this.battleGrid]
				: [this.mechEnemy, this.modulesEnemy, this.battleGridEnemy];

		// extend base part joints to include placed modules
		const gridExtended = copyCells(mech.grid);
		forCells(modules.grid, (x, y, cell) => {
			const idx = Number(cell);
			if (Number.isNaN(idx)) return;
			if (!modules.placed[idx].module.tags.includes('joint')) return;
			gridExtended[y][x] = '=';
		});

		const severedHead = getFlood(gridExtended, ...mech.connections.head).every(
			([x, y]) => grid[y][x] === 'X'
		);
		const severedArmL = getFlood(gridExtended, ...mech.connections.armL).every(
			([x, y]) => grid[y][x] === 'X'
		);
		const severedArmR = getFlood(gridExtended, ...mech.connections.armR).every(
			([x, y]) => grid[y][x] === 'X'
		);
		const severedLegL = getFlood(gridExtended, ...mech.connections.legL).every(
			([x, y]) => grid[y][x] === 'X'
		);
		const severedLegR = getFlood(gridExtended, ...mech.connections.legR).every(
			([x, y]) => grid[y][x] === 'X'
		);
		const cockpits = modules.placed.filter(
			(i) =>
				i.module.tags.includes('cockpit') && !this.moduleIsDestroyed(i, grid)
		);
		let poweredChest = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'C');
		let poweredHead = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'H');
		let poweredArmL = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'AL');
		let poweredArmR = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'AR');
		let poweredLegL = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'LL');
		let poweredLegR = cockpits.some((i) => mech.gridParts[i.y][i.x] === 'LR');

		// check chest power connections first since everything else is only connected to chest
		poweredChest =
			poweredChest ||
			(poweredHead && !severedHead) ||
			(poweredArmL && !severedArmL) ||
			(poweredArmR && !severedArmR) ||
			(poweredLegL && !severedLegL) ||
			(poweredLegR && !severedLegR);
		poweredHead = poweredHead || (poweredChest && !severedHead);
		poweredArmL = poweredArmL || (poweredChest && !severedArmL);
		poweredArmR = poweredArmR || (poweredChest && !severedArmR);
		poweredLegL = poweredLegL || (poweredChest && !severedLegL);
		poweredLegR = poweredLegR || (poweredChest && !severedLegR);

		forCells(mech.gridParts, (x, y, cell) => {
			if (cell === 'C' && !poweredChest) grid[y][x] = 'X';
			if (cell === 'H' && !poweredHead) grid[y][x] = 'X';
			if (cell === 'AL' && !poweredArmL) grid[y][x] = 'X';
			if (cell === 'AR' && !poweredArmR) grid[y][x] = 'X';
			if (cell === 'LL' && !poweredLegL) grid[y][x] = 'X';
			if (cell === 'LR' && !poweredLegR) grid[y][x] = 'X';
		});
	}

	async zoop(
		who: 'player' | 'enemy',
		x: number,
		y: number,
		tint = red,
		text: string
	) {
		const p = (
			who === 'player' ? this.damageBtns : this.damageBtnsEnemy
		).gridBtnsByPos[y][x].display.container.toGlobal({ x: 0, y: 0 });
		p.x -= size.x / 2;
		p.y -= size.y / 2;
		const g = new Graphics();

		let s = { v: 0 };
		TweenManager.tween(
			s,
			'v',
			1,
			500,
			undefined,
			(t) => eases.cubicInOut(t) * eases.backOut(t)
		);
		const m = Math.max(size.x, size.y);

		const zoop = new Updater(this.camera, () => {
			g.clear()
				.beginPath()
				.rect(
					lerp(-m / 2, p.x - cellSize / 2, s.v),
					lerp(-m / 2, p.y - cellSize / 2, s.v),
					lerp(m, cellSize, s.v),
					lerp(m, cellSize, s.v)
				)
				.stroke({
					color: tint,
					width: 2,
					alpha: s.v,
				})
				.fill({
					color: tint,
					alpha: s.v * 0.5,
				});
		});
		this.camera.scripts.push(zoop);
		this.containerUI.addChild(g);
		await delay(500);
		removeFromArray(this.camera.scripts, zoop);
		zoop.destroy?.();
		g.destroy();
		this.textPop(text, p.x, p.y);
	}

	async textPop(text: string, x: number, y: number, tint = white) {
		const container = new Container();
		const textHit1 = new BitmapText({ text, style: fontDialogue });
		const textHit2 = new BitmapText({ text, style: fontDialogue });
		const textHit3 = new BitmapText({ text, style: fontDialogue });
		textHit1.tint = black;
		textHit2.tint = black;
		textHit3.tint = tint;
		container.addChild(textHit1);
		container.addChild(textHit2);
		container.addChild(textHit3);
		textHit1.x += 1;
		textHit2.y += 1;
		this.containerUI.addChild(container);
		container.x = x;
		container.y = y;
		const tween1 = TweenManager.tween(
			container,
			'y',
			y - 10,
			2000,
			undefined,
			eases.cubicIn
		);
		await delay(1500);
		const tween2 = TweenManager.tween(
			container,
			'alpha',
			0,
			500,
			undefined,
			eases.cubicIn
		);
		await delay(500);
		TweenManager.abort(tween1);
		TweenManager.abort(tween2);
		container.destroy();
	}

	playOverheat() {
		return new Promise<string[]>(async (r) => {
			const log: string[] = [];
			// hit self from overheat
			let overheat = this.getHeat() - this.actions.heatMax;
			while (overheat-- > 0) {
				await delay(500);
				await this.overheat('player');
				log.push('OVERHEATED');
			}
			r(log);
		});
	}

	playActions(shieldsEnemy: number) {
		return new Promise<string[]>(async (r) => {
			const log: string[] = [];
			let shields = shieldsEnemy;
			log.push(
				...(await this.attack('enemy', {
					attacks: this.actions.attacks,
					shields,
				}))
			);
			// reveal scans
			log.push(...(await this.scan('enemy', this.actions.scans)));

			// expand hits to sever parts
			await this.severParts('enemy');
			this.reassemble();

			r(log);
		});
	}

	enemyActions() {
		return new Promise<{ shields: number; log: string[] }>(async (r) => {
			const tags = this.modulesEnemy.placed
				.filter((i) => !this.moduleIsDestroyed(i, this.battleGridEnemy))
				.flatMap((i) => i.module.tags);
			const { attacksMax, scansMax, shieldsAmt, heatMax } =
				this.tagsToPossibleActions(tags);
			let shields = 0;
			let attacks: [number, number][] = [];
			let scans: [number, number][] = [];

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

			for (let i = 0; i < scansMax; ++i) {
				// TODO: better deciding whether to scan
				// - when to be more/less aggressive?
				// - when to overheat?
				// - when to scan vs attack?
				if (randItem([true, false, false])) continue;
				if (
					heatMax - shields - attacks.length - scans.length < 0 &&
					heatMax <= 1
				)
					continue;
				if (
					heatMax - shields - attacks.length - scans.length < 0 &&
					randItem([true, false, false, false, false, false])
				)
					continue;

				const target = possibleTargets.pop();
				if (!target) break;
				scans.push(target);
			}

			// play enemy actions
			const log: string[] = [];

			// overheat
			let overheat = this.getHeat() - heatMax;
			while (overheat-- > 0) {
				await delay(500);
				await this.overheat('enemy');
				log.push('OVERHEATED');
			}

			log.push(
				...(await this.attack('player', {
					attacks: attacks,
					shields: this.actions.shield,
				}))
			);
			// reveal scans
			log.push(...(await this.scan('player', scans)));

			// expand hits to sever parts
			await this.severParts('player');
			this.reassemble();

			r({ shields, log });
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
