import {
	BitmapText,
	Container,
	EventEmitter,
	Rectangle,
	Sprite,
	Text,
	Texture,
} from 'pixi.js';
import Strand from 'strand-core';
import { sfx } from './Audio';
import { game } from './Game';
import { GameObject } from './GameObject';
import { Animator } from './Scripts/Animator';
import { Display } from './Scripts/Display';
import { Toggler } from './Scripts/Toggler';
import { Transform } from './Scripts/Transform';
import { Tween, TweenManager } from './Tweens';
import { size } from './config';
import { fontDialogue } from './font';
import { KEYS, keys } from './input-keys';
import { getActiveScene, getInput, mouse } from './main';
import { buttonify, clamp, lerp, setTextWrapped, smartify, tex } from './utils';

const rateBase = 0.75;
const rateLetter = 0.5;
const rateQuestionMultiplier = 1.4;
const questionInflectionRange = 6;
const volumeBase = 0.75;
const volumeExclamation = 1;
const exclamationInflectionRange = 10;

export class UIDialogue extends GameObject {
	padding = {
		top: 175,
		bottom: 175,
		left: 260,
		right: 235,
	};

	sprScrim: Sprite;

	tweenScrim?: Tween;

	tweens: Tween[] = [];

	sprBg: Sprite;

	animatorBg: Animator;

	transform: Transform;

	display: Display;

	togglerL: Toggler;
	togglerR: Toggler;

	isOpen: boolean;

	textText: BitmapText;

	choices: (BitmapText & EventEmitter)[];

	selected: number | undefined;

	containerChoices: Container;

	sprChoices: Sprite;

	strText: string;

	strand: Strand;

	pos: number;

	private posTime: number;

	private posDelay: number;

	voice = 'Default' as string | undefined;

	height() {
		return this.sprBg.height;
	}

	progress() {
		return this.display.container.alpha;
	}

	constructor(strand: Strand) {
		super();

		this.strand = strand;
		this.isOpen = false;
		this.scripts.push((this.transform = new Transform(this)));
		this.scripts.push((this.display = new Display(this)));
		this.display.container.interactiveChildren = true;
		this.display.container.accessibleChildren = true;
		this.sprScrim = new Sprite(Texture.WHITE);
		this.sprScrim.label = 'scrim';
		this.sprScrim.tint = 0x000000;
		this.sprScrim.width = size.x;
		this.sprScrim.height = size.y;
		this.sprScrim.alpha = 1;
		this.sprBg = new Sprite(tex('dialogueBg'));
		this.sprScrim.label = 'dialogueBg';
		this.sprBg.anchor.y = 1.0;
		this.scripts.push(
			(this.animatorBg = new Animator(this, { spr: this.sprBg, freq: 1 / 400 }))
		);
		this.transform.x = 0;

		this.scripts.push((this.togglerL = new Toggler(this)));
		this.togglerL.container.x += size.x / 2 - 350;
		this.togglerL.container.y = -size.y / 2;

		this.scripts.push((this.togglerR = new Toggler(this)));
		this.togglerR.container.x += size.x / 2 + 350;
		this.togglerR.container.y = -size.y / 2;

		this.strText = '';
		this.pos = 0;
		this.posTime = 0;
		this.posDelay = 2;
		this.selected = undefined;
		this.textText = new BitmapText({ text: this.strText, style: fontDialogue });
		this.display.container.accessible = true;
		this.display.container.on('click', (event) => {
			if (event && event.button !== mouse.LEFT) return;
			if (this.isOpen) this.complete();
		});
		this.containerChoices = new Container();
		this.containerChoices.alpha = 0;
		this.sprChoices = new Sprite(tex('blank'));
		this.sprChoices.label = 'choicesBg';
		this.scripts.push(
			new Animator(this, { spr: this.sprChoices, freq: 1 / 400 })
		);
		this.sprChoices.anchor.x = 0;
		this.sprChoices.anchor.y = 0;
		this.containerChoices.addChild(this.sprChoices);
		this.containerChoices.x = this.padding.left;
		this.choices = [];
		window.text = this.textText;
		this.textText.y = -this.sprBg.height + this.padding.top;
		this.textText.x = this.padding.left;
		this.textText.style.wordWrapWidth =
			this.sprBg.width - this.padding.left - this.padding.right;

		this.display.container.addChild(this.sprScrim);
		this.display.container.addChild(this.sprBg);
		this.display.container.addChild(this.togglerL.container);
		this.display.container.addChild(this.togglerR.container);
		this.display.container.addChild(this.textText);
		this.display.container.addChild(this.containerChoices);

		game.app.stage.addChild(this.display.container);

		this.sprBg.alpha = 0;
		this.transform.y = size.y;
		this.init();
	}

	destroy() {
		this.tweens.forEach((t) => TweenManager.abort(t));
		game.app.stage.removeChild(this.display.container);
		super.destroy();
	}

	update(): void {
		super.update();
		this.textText.pivot.x = -this.sprBg.x;
		this.textText.pivot.y = -this.sprBg.y;
		this.containerChoices.pivot.x = -this.sprBg.x;
		this.containerChoices.pivot.y = -this.sprBg.y;
		this.textText.alpha = this.sprBg.alpha;
		this.display.container.interactive = this.isOpen;
		const input = getInput();

		if (this.isOpen) {
			this.sprBg.alpha = this.progress();
		} else {
			this.sprBg.alpha = Math.max(0, this.progress() * 2 - 1);
		}

		this.containerChoices.alpha = lerp(
			this.containerChoices.alpha,
			this.isOpen && this.pos > this.strText.length ? 1 : 0,
			0.2
		);

		// early return (still opening)
		if (this.progress() < 0.9) return;

		if (this.isOpen && this.choices.length) {
			// make single option clickable from anywhere
			if (this.choices.length === 1) {
				const p = this.choices[0].toGlobal({ x: 0, y: 0 });
				this.choices[0].hitArea = new Rectangle(-p.x, -p.y, size.x, size.y);
			}

			if (this.containerChoices.alpha > 0.5) {
				if (input.justMoved.y) {
					if (this.selected !== undefined) {
						this.choices[this.selected].alpha = 1;
					}
					if (this.selected === undefined) {
						this.selected = 0;
					} else if (input.justMoved.y > 0) {
						this.selected =
							this.selected < this.choices.length - 1 ? this.selected + 1 : 0;
					} else if (input.justMoved.y < 0) {
						this.selected =
							this.selected > 0 ? this.selected - 1 : this.choices.length - 1;
					}
					this.choices[this.selected].alpha = 0.75;
					sfx('voiceDefault');
				} else if (input.interact && this.selected !== undefined) {
					this.choices[this.selected].emit('click');
				} else if (input.interact && this.choices.length === 1) {
					this.choices[0].emit('click');
				} else if (input.interact) {
					this.complete();
				} else {
					this.choices
						.find((_, idx) => keys.isJustDown(KEYS.ONE + idx))
						?.emit('click');
				}
			} else if (input.interact) {
				this.complete();
			}
		}

		// early return (animation complete)
		if (this.pos > this.strText.length) return;
		this.posTime += game.app.ticker.deltaTime;
		const prevPos = this.pos;
		while (this.posTime > this.posDelay) {
			this.pos += 1;
			this.posTime -= this.posDelay;
		}
		if (prevPos !== this.pos) {
			const letter = this.strText?.[this.pos]?.replace(/[^\w]/, '');
			if (this.pos % 2 && letter && this.voice !== 'None') {
				const rate = ((letter.charCodeAt(0) % 30) / 30) * rateLetter + rateBase;
				let nextQuestion = this.strText.indexOf('?', this.pos) - this.pos;
				if (nextQuestion <= 0) nextQuestion = 1;
				else
					nextQuestion = lerp(
						rateQuestionMultiplier,
						1,
						clamp(0, nextQuestion / questionInflectionRange, 1)
					);
				let nextExclamation = this.strText.indexOf('!', this.pos) - this.pos;
				if (nextExclamation <= 0) nextExclamation = volumeBase;
				else
					nextExclamation = lerp(
						volumeExclamation,
						volumeBase,
						clamp(0, nextExclamation / exclamationInflectionRange, 1)
					);
				sfx(`voice${this.voice}`, {
					rate: rate * nextQuestion,
					volume: nextExclamation,
				});
			}
			this.textText.text = Array.from(this.strText).slice(0, this.pos).join('');
		}
	}

	say(text: string, actions?: { text: string; action: () => void }[]) {
		text = smartify(text);
		// make punctuation delay a lot
		text = text.replace(
			/([.!?]"?)(\s)/g,
			'$1\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B$2'
		);
		// make cut-off dashes delay a lot
		text = text.replace(
			/([-–⁠—])(\s)/g,
			'$1\u200B\u200B\u200B\u200B\u200B\u200B\u200B\u200B$2'
		);
		// make commas delay a bit
		text = text.replace(/(,"?)(\s)/g, '$1\u200B\u200B\u200B\u200B$2');
		this.selected = undefined;

		this.strText = setTextWrapped(this.textText, text);

		this.textText.text = '';
		this.display.container.accessibleHint = text;
		this.choices.forEach((i) => i.destroy());
		this.containerChoices.removeChild(this.sprChoices);
		this.choices = (actions || []).map((i, idx, a) => {
			const choiceText = i.text || getActiveScene()?.t('choiceDefault');
			const strText = smartify(
				a.length > 1 ? `${idx + 1}. ${choiceText}` : choiceText
			);
			const t = new BitmapText({
				text: strText,
				style: {
					...this.textText.style,
					wordWrapWidth: (this.textText.style.wordWrapWidth || 0) - 2,
				},
			});
			buttonify(t, strText || 'continue');

			t.on('pointerover', () => {
				t.alpha = 0.75;
				this.selected = idx;
			});
			t.on('mouseover', () => {
				t.alpha = 0.75;
				this.selected = idx;
			});
			t.on('pointerout', () => {
				t.alpha = 1;
				this.selected = undefined;
			});
			t.on('mouseout', () => {
				t.alpha = 1;
				this.selected = undefined;
			});
			t.on('click', (event) => {
				if (event && event.button !== undefined && event.button !== mouse.LEFT)
					return;
				if (this.containerChoices.alpha > 0.5) {
					sfx('voiceDefault');
					if (this.choices.length > 1) {
						const scene = getActiveScene();
						if (scene) scene.strand.lastChoice = i.text;
					}
					i.action();
				}
			});
			t.on('tap', () => {
				if (this.containerChoices.alpha > 0.5) {
					if (this.choices.length > 1) {
						const scene = getActiveScene();
						if (scene) scene.strand.lastChoice = i.text;
					}
					i.action();
				}
			});
			t.anchor.x = 0;
			if (idx > 0) {
				t.y +=
					this.containerChoices.children[idx - 1].y +
					(this.containerChoices.children[idx - 1] as Text).height;
			}
			this.containerChoices.addChild(t);
			return t;
		});
		this.containerChoices.y =
			this.textText.height - this.containerChoices.height - this.padding.bottom;

		this.containerChoices.alpha = 0.0;
		if (this.choices.length > 0) {
			this.display.container.addChild(this.containerChoices); // always put choices on top
		}
		this.sprChoices.width =
			this.containerChoices.width - (fontDialogue.padding ?? 0) * 2;
		this.sprChoices.height =
			this.containerChoices.height - (fontDialogue.padding ?? 0) * 2;
		this.sprChoices.x = 0;
		this.sprChoices.y = 0;
		this.sprChoices.width += Math.abs(this.sprChoices.x) * 2;
		this.sprChoices.height += Math.abs(this.sprChoices.y) * 2;
		this.containerChoices.addChildAt(this.sprChoices, 0);

		this.open();
		this.pos = 0;
		this.posTime = 0;
	}

	showL(...args: Parameters<Toggler['show']>) {
		return this.togglerL.show(...args);
	}

	showR(...args: Parameters<Toggler['show']>) {
		return this.togglerR.show(...args);
	}

	complete() {
		if (this.pos >= this.strText.length) return;
		this.pos = this.strText.length;
		this.textText.text = this.strText;
	}

	private open() {
		if (!this.isOpen) {
			this.isOpen = true;
			this.tweens.forEach((t) => TweenManager.abort(t));
			this.tweens.length = 0;
			this.tweens.push(
				TweenManager.tween(this.display.container, 'alpha', 1, 200)
			);
		}
	}

	close() {
		if (this.isOpen) {
			this.choices.forEach((i) => {
				i.interactive = false;
				i.destroy();
			});
			this.choices = [];
			this.isOpen = false;
			this.tweens.forEach((t) => TweenManager.abort(t));
			this.tweens.length = 0;
			this.tweens.push(
				TweenManager.tween(this.display.container, 'alpha', 0, 200)
			);
		}
	}

	scrim(amount: number, duration?: number) {
		if (this.tweenScrim) TweenManager.abort(this.tweenScrim);
		if (duration) {
			this.tweenScrim = TweenManager.tween(
				this.sprScrim,
				'alpha',
				amount,
				duration
			);
		} else {
			this.sprScrim.alpha = amount;
		}
	}
}
