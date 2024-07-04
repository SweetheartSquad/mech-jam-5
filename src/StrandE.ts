/* eslint-disable class-methods-use-this */
import browserLang from 'browser-lang';
import ease from 'eases';
import * as PIXI from 'pixi.js';
import { Sprite, TextStyle } from 'pixi.js';
import Strand from 'strand-core';
import { Area } from './Area';
import { music, sfx } from './Audio';
import { Emitter } from './Emitter';
import { resource, resources } from './Game';
import { GameObject } from './GameObject';
import { GameScene } from './GameScene';
import { Poof } from './Poof';
import { Prop } from './Prop';
import { PropParallax } from './PropParallax';
import { Display } from './Scripts/Display';
import { Transform } from './Scripts/Transform';
import { Updater } from './Scripts/Updater';
import { storage } from './Storage';
import { TweenManager } from './Tweens';
import { size } from './config';
import { fontIngame } from './font';
import { setScene } from './main';
import { Prompt } from './prompt';
import {
	chunks,
	clamp,
	delay,
	mousePos,
	relativeMouse,
	shuffle,
	tex,
} from './utils';

export class StrandE extends Strand {
	scene!: GameScene;

	debug?: boolean;

	gameObject?: GameObject;

	voice?: string;

	PIXI = PIXI;

	ease = ease;

	size = size;

	storage = storage;

	language?: string;

	lastChoice?: string;

	delay = delay;

	tex = tex;

	clamp = clamp;

	mousePos = mousePos;

	relativeMouse = relativeMouse;

	setSource(src: string) {
		super.setSource(
			src
				// voice sugar
				.replace(
					/^voice(\w+)$/gm,
					(_: string, voice: string) => `<<do this.voice='${voice}'>>`
				)
		);

		// create passage select for debugging purposes
		const passages = Object.keys(this.passages)
			.filter((i) => !i.match(/\d/))
			.map((i) => `[[${i}]]`);
		const pages = chunks(passages, 23);
		pages.forEach((i, idx) => {
			if (pages.length > 1) {
				i.push(`[[passage select ${(idx + 1) % pages.length}]]`);
			}
			i.push('[[back|this.back()]]');
			this.passages[`passage select ${idx}`] = {
				title: `passage select ${idx}`,
				body: i.join('\n'),
			};
		});
		this.passages['passage select'] = this.passages['passage select 0'];

		// create language select for debugging purposes
		const languageLabels: Partial<{ [key: string]: string }> = {
			en: 'English',
		};
		const languages = Object.keys(resources)
			.filter((i) => i.startsWith('main-'))
			.map((i) => i.split('-').slice(1).join('-'));

		this.language = languages.includes(this.language || '')
			? this.language
			: browserLang({ languages, fallback: 'en' });
		document.documentElement.lang = this.language || 'en';

		this.passages['language select'] = {
			title: 'language select',
			body: languages
				.map(
					(i) =>
						`[[${
							languageLabels[i] || i
						}|this.language='${i}';this.setSource(resource('main-${i}'));this.back();]]`
				)
				.concat('[[back|this.back()]]')
				.join('\n'),
		};
	}

	show(...args: Parameters<(typeof this.scene)['dialogue']['show']>) {
		return this.scene.dialogue.show(...args);
	}

	tween(...args: Parameters<(typeof TweenManager)['tween']>) {
		// just a pass-through
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return TweenManager.tween(...args);
	}

	tweenFinish = TweenManager.finish;

	tweenAbort = TweenManager.abort;

	shuffle(...args: Parameters<typeof shuffle>) {
		return shuffle(...args);
	}

	scrim(...args: Parameters<(typeof this.scene)['dialogue']['scrim']>) {
		this.scene.dialogue.scrim(...args);
	}

	sfx(...args: Parameters<typeof sfx>) {
		return sfx(...args);
	}

	music(...args: Parameters<typeof music>) {
		return music(...args);
	}

	restart() {
		// TODO: persist language in storage instead of here so it works across refresh?
		const { language } = this.scene.strand;
		setScene(() => {
			const scene = new GameScene();
			scene.strand.language = language;
			scene.strand.setSource(resource(`main-${scene.strand.language}`) || '');
			return scene;
		});
	}

	destroy(gameObject: GameObject) {
		Area.unmount([gameObject]);
		Object.values(this.scene.areas).forEach((i) => {
			if (i) Area.remove(i, gameObject);
		});
		gameObject.destroy();
	}

	add(...objs: GameObject[]) {
		const a = this.scene.currentArea;
		if (!a) return;
		Area.add(a, ...objs);
		Area.mount([...objs], this.scene.container);
		objs.forEach((i) => {
			i.getScript(Display)?.updatePosition();
		});
		this.scene.sortScene();
	}

	remove(obj: GameObject) {
		const a = this.scene.currentArea;
		if (!a) return;
		Area.remove(a, obj);
		Area.unmount([obj]);
	}

	Area(name: string, objects: GameObject[]) {
		const a = objects.filter((i) => i);
		this.scene.areas[name] = a;
		Area.unmount(a);
	}

	Prop(...args: ConstructorParameters<typeof Prop>) {
		return new Prop(...args);
	}

	PropComposite(
		...args: (
			| Pick<
					ConstructorParameters<typeof Prop>[0],
					'texture' | 'x' | 'y' | 'alpha'
			  >
			| Prop
			| undefined
			| null
			| false
		)[]
	) {
		const propIdx = args.findIndex((i) => (i as Prop).spr);
		const prop = args[propIdx] as Maybe<Prop>;
		if (!prop) throw new Error('No prop provided in composite');
		args
			.slice(0, propIdx)
			.reverse()
			.forEach((i) => {
				if (!i) return;
				const options = i as Pick<
					ConstructorParameters<typeof Prop>[0],
					'texture' | 'x' | 'y' | 'alpha'
				>;
				const spr = new Sprite(tex(options.texture));
				spr.label = `composite ${options.texture}`;
				spr.x = options.x || 0;
				spr.y = options.y || 0;
				spr.anchor.x = 0.5;
				spr.anchor.y = 1;
				spr.alpha = options.alpha || 1;
				prop.display.container.addChildAt(spr, 0);
			});
		args.slice(propIdx + 1).forEach((i) => {
			if (!i) return;
			const options = i as Pick<
				ConstructorParameters<typeof Prop>[0],
				'texture' | 'x' | 'y'
			>;
			const spr = new Sprite(tex(options.texture));
			spr.label = `composite ${options.texture}`;
			spr.x = options.x || 0;
			spr.y = options.y || 0;
			spr.anchor.x = 0.5;
			spr.anchor.y = 1;
			prop.display.container.addChild(spr);
		});
		return prop;
	}

	Poof(...args: ConstructorParameters<typeof Poof>) {
		return new Poof(...args);
	}

	Emitter(...args: ConstructorParameters<typeof Emitter>) {
		return new Emitter(...args);
	}

	PropParallax(...args: ConstructorParameters<typeof PropParallax>) {
		return new PropParallax(...args);
	}

	Text(
		str: string,
		{
			x = 0,
			y = 0,
			offset = 0,
			font,
		}: {
			x?: number;
			y?: number;
			font?: Partial<TextStyle>;
			offset?: number;
		} = {}
	) {
		const go = new GameObject();
		const transform = new Transform(go);
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		go.transform = transform;
		transform.x = x;
		transform.y = y + offset;
		go.scripts.push(transform);
		const display = new Display(go);
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		go.display = display;
		go.scripts.push(display);
		const text = new PIXI.BitmapText({
			text: str,
			style: { ...fontIngame, ...font },
		});
		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		go.text = text;
		display.container.addChild(text);
		go.init();
		text.anchor.x = 0.5;
		text.y -= offset;
		return go;
	}

	Updater(cb: ConstructorParameters<typeof Updater>[1]) {
		const go = new GameObject();
		go.scripts.push(new Updater(go, cb));
		return go;
	}

	async prompt(options: ConstructorParameters<typeof Prompt>[2]) {
		this.scene.dialogue.complete();
		await new Promise<void>((r) => {
			const check = () => {
				if (!this.busy) {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							r();
						});
					});
					return;
				}
				requestAnimationFrame(check);
			};
			check();
		});
		this.scene.dialogue.strText = `${options?.defaultValue || ''}_`;
		this.scene.dialogue.pos = this.scene.dialogue.strText.length;
		return new Promise<string>((resolve) => {
			let value = options?.defaultValue || '';
			const p = new Prompt(
				(v) => {
					value = v;
					sfx('voiceDefault');

					const highlight =
						(p.elInput.selectionEnd || 0) - (p.elInput.selectionStart || 0);
					let str = p.elInput.value;
					// insert caret/replace highlighted text
					str = `${str.substring(0, p.elInput.selectionStart || 0)}${
						highlight > 0 ? '█'.repeat(highlight) : '_'
					}${str.substring(p.elInput.selectionEnd || 0)}`;

					this.scene.dialogue.strText = str;
					this.scene.dialogue.pos = str.length;
				},
				() => {
					resolve(value);
				},
				options
			);
		});
	}
}
