import { Container, Point, Texture } from 'pixi.js';
import { resizer } from '.';
import { resource } from './Game';
import { size } from './config';
import { getActiveScene, mouse } from './main';

export const zero = new Point(0, 0);

export function delay(time: number) {
	return new Promise<void>((r) => {
		setTimeout(r, time);
	});
}

// linear interpolation
export function lerp(from: number, to: number, t: number): number {
	if (Math.abs(to - from) < 0.0000001) {
		return to;
	}
	return from + (to - from) * t;
}

export function slerp(from: number, to: number, by: number): number {
	from /= Math.PI * 2;
	to /= Math.PI * 2;
	while (to - from > 0.5) {
		from += 1;
	}
	while (to - from < -0.5) {
		from -= 1;
	}
	return ((from + by * (to - from)) % 1) * Math.PI * 2;
}

// returns v, clamped between min and max
export function clamp(min: number, v: number, max: number): number {
	return Math.max(min, Math.min(v, max));
}

export function partition<T>(arr: T[], condition: (i: T) => boolean): T[][] {
	const a: T[] = [];
	const b: T[] = [];
	arr.forEach((i) => {
		(condition(i) ? a : b).push(i);
	});
	return [a, b];
}

export function chunks<T>(arr: T[], count: number): T[][] {
	const a: T[][] = [[]];
	arr.forEach((i, idx) => {
		const chunkIdx = Math.floor(idx / count);
		const chunk = (a[chunkIdx] = a[chunkIdx] || []);
		chunk.push(i);
	});
	return a;
}

export function unique<T>(arr: T[]) {
	return Array.from(new Set(arr));
}

export function ease(t: number): number {
	/* eslint-disable */
	if ((t /= 0.5) < 1) {
		return 0.5 * t * t * t;
	}
	return 0.5 * ((t -= 2) * t * t + 2);
	/* eslint-enable */
}

// returns the smallest power-of-2 which contains v
export function nextPowerOfTwo(v: number): number {
	return 2 ** Math.ceil(Math.log(v) / Math.log(2));
}

// returns fractional part of number
export function fract(v: number): number {
	return v - Math.floor(Math.abs(v)) * Math.sign(v);
}

export function randItem<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function reduceSum(sum: number, item: number): number {
	return sum + item;
}

const grayscaleCoefficients = [0.2126, 0.7152, 0.0722];
export function reduceGrayscale(
	sum: number,
	item: number,
	idx: number
): number {
	return sum + item * grayscaleCoefficients[idx];
}
export function contrastDiff(
	a: [number, number, number],
	b: [number, number, number]
) {
	return a.reduce(
		(sum, _, idx) =>
			sum +
			Math.abs(
				a[idx] * grayscaleCoefficients[idx] -
					b[idx] * grayscaleCoefficients[idx]
			),
		0
	);
}
export function removeFromArray<T>(array: T[], item: T) {
	const idx = array.indexOf(item);
	if (idx !== -1) {
		array.splice(idx, 1);
	}
}

export function shuffle<T>(array: T[]) {
	const pool = array.slice();
	const shuffled = [];
	while (pool.length) {
		const i = randItem(pool);
		removeFromArray(pool, i);
		shuffled.push(i);
	}
	return shuffled;
}

export function randRange(min: number, max: number) {
	return Math.random() * (max - min) + min;
}

/** @returns random point, uniformly distributed inside circle */
export function randCirc(radius: number) {
	const r = radius * Math.sqrt(Math.random());
	const a = randRange(0, Math.PI * 2);
	return { x: r * Math.cos(a), y: r * Math.sin(a) };
}

/**
 * Modifies a values between 0-100,
 * weighted for diminishing returns and losses
 * the closer you are to the extremes
 *
 * e.g.
 * ```ts
 * fairmath( 0,  50); // 50
 * fairmath(50,  50); // 75
 * fairmath(75,  50); // 88
 * fairmath( 0, -50); //  0
 * fairmath(50, -50); // 25
 * fairmath(75, -50); // 38
 * ```
 *
 * @param input original value (0 to 100)
 * @param delta "percent" to change (-100 to 100)
 * @returns "fairly" adjusted value
 */
export function fairmath(input: number, delta: number) {
	input = clamp(0, input, 100);
	delta = clamp(-100, delta, 100);
	if (delta < 0) {
		return input + input * (delta / 100);
	}
	return input + (100 - input) * (delta / 100);
}

export function tex(texture: string) {
	return (
		resource<Texture>(texture) || resource<Texture>('error') || Texture.EMPTY
	);
}

export function evalFn(fn: string) {
	// eslint-disable-next-line @typescript-eslint/no-implied-eval
	return Function(
		`"use strict";return ${fn.replace(/\/\*\*[^]*?\*\//m, '').trim()}`
	)();
}

export async function toggleFullscreen(element?: HTMLElement) {
	element = document.documentElement;

	const isFullscreen = !!document.fullscreenElement || false;

	await (isFullscreen
		? document.exitFullscreen()
		: element.requestFullscreen());
	return !!document.fullscreenElement;
}

// based on https://stackoverflow.com/a/31254199
export function pointOnRect(
	x: number,
	y: number,
	minX: number,
	minY: number,
	maxX: number,
	maxY: number
) {
	if (minX < x && x < maxX && minY < y && y < maxY) return undefined;
	const midX = (minX + maxX) / 2;
	const midY = (minY + maxY) / 2;
	const m = (midY - y) / (midX - x);
	if (x <= midX) {
		const minXy = m * (minX - x) + y;
		if (minY <= minXy && minXy <= maxY) return { x: minX, y: minXy };
	}
	if (x >= midX) {
		const maxXy = m * (maxX - x) + y;
		if (minY <= maxXy && maxXy <= maxY) return { x: maxX, y: maxXy };
	}
	if (y <= midY) {
		const minYx = (minY - y) / m + x;
		if (minX <= minYx && minYx <= maxX) return { x: minYx, y: minY };
	}
	if (y >= midY) {
		const maxYx = (maxY - y) / m + x;
		if (minX <= maxYx && maxYx <= maxX) return { x: maxYx, y: maxY };
	}
	if (x === midX && y === midY) return { x, y };
	return undefined;
}

export function splitFirst(str: string, separator: string) {
	const idx = str.indexOf(separator);
	return [
		str.substring(0, idx),
		str.substring(idx + separator.length),
	] as const;
}

/**
 * replaces regular quotes with context-aware smart quotes
 * also replaces --- with em dash
 * also replaces -- with en dash
 * also replaces last space with a nsbp to avoid orphaned words
 * @param {string} str string to replace
 */
export function smartify(str = '') {
	return str
		.replace(
			/("+)(.*?)("+)/g,
			(_, l, i, r) => `${'“'.repeat(l.length)}${i}${'”'.repeat(r.length)}`
		)
		.replace(/(\w)'(\w)/g, '$1’$2')
		.replace(
			/('+)(.*?)('+)/g,
			(_, l, i, r) => `${'‘'.repeat(l.length)}${i}${'’'.repeat(r.length)}`
		)
		.replace(/---/g, '—')
		.replace(/--/g, '–')
		.replace(/^([^]+) (.+?)$/, '$1\u00A0$2');
}

export function mousePos(event: MouseEvent) {
	const rect = (event.currentTarget as HTMLElement)?.getBoundingClientRect();
	const x = (event.clientX - rect.left) / window.resizer.scaleMultiplier;
	const y = (event.clientY - rect.top) / window.resizer.scaleMultiplier;
	const p = getActiveScene()?.camera.display.container.toLocal({ x, y });
	return p;
}

/** @returns mouse position in coordinates normalized to original game size (i.e. ignoring CSS scale) */
export function relativeMouse() {
	return {
		x:
			((mouse.x - resizer.childElement.offsetLeft) /
				resizer.childElement.clientWidth) *
			size.x,
		y:
			((mouse.y - resizer.childElement.offsetTop) /
				resizer.childElement.clientHeight) *
			size.y,
	};
}

/** @returns the item, or the first element if it's an array */
export function firstCoalesce<T>(value: T | T[]): T {
	return Array.isArray(value) ? value[0] : value;
}

/** @returns reversed copy of the string */
export function strReverse(str: string) {
	return [...str].reverse().join('');
}

export function buttonify(obj: Container, title?: string) {
	obj.accessible = true;
	obj.accessibleTitle = title;
	obj.accessibleHint = title;
	obj.interactive = true;
	obj.eventMode = 'dynamic';
	obj.cursor = 'pointer';
	obj.tabIndex = 0;
}
