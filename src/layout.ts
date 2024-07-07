import { Container, Graphics, Texture } from 'pixi.js';
import { cellSize } from './config';
import { DEBUG } from './debug';
import { game } from './Game';
import { flipMatrixH, flipMatrixV, rotateMatrixClockwise } from './utils';

export function parseLayout(
	source: string,
	{ square = false, flip = false }: { square?: boolean; flip?: boolean } = {}
) {
	let w = source
		.split('\n')
		.reduce((max, row) => Math.max(max, row.trimEnd().length), 0);
	let rows = source
		.replaceAll(' ', '.')
		.split('\n')
		.map((i) => i.substring(0, w).padEnd(w, '.'))
		.map((i) => i.split(''));
	let h = rows.length;

	if (square) {
		for (let i = w; i < h; ++i) {
			if (i % 2) {
				rows.forEach((row) => row.unshift('.'));
			} else {
				rows.forEach((row) => row.push('.'));
			}
		}
		for (let i = h; i < w; ++i) {
			if (i % 2) {
				rows.unshift(new Array(w).fill('.'));
			} else {
				rows.push(new Array(w).fill('.'));
			}
		}
		w = Math.max(w, h);
		h = w;
	}
	if (flip) rows = flipMatrixH(rows);
	return { cells: rows, w, h };
}

export function forCells(
	rows: string[][],
	cb: (x: number, y: number, cell: string) => void
) {
	rows.forEach((row, y) =>
		row.forEach((cell, x) => {
			if (!cell.trim() || cell === '.') return; // skip empties
			cb(x, y, cell);
		})
	);
}

export function flatten(
	entries: { cells: string[][]; x: number; y: number }[]
) {
	const map: { [key: string]: string } = {};
	entries.forEach((i) => {
		forCells(i.cells, (x, y, cell) => {
			map[`${y + i.y},${x + i.x}`] = cell;
		});
	});
	const bounds = Object.keys(map)
		.map((i) => i.split(',').map((j) => Number(j)))
		.reduce(
			(b, i) => {
				b.minx = Math.min(b.minx, i[1]);
				b.miny = Math.min(b.miny, i[0]);
				b.maxx = Math.max(b.maxx, i[1]);
				b.maxy = Math.max(b.maxy, i[0]);
				return b;
			},
			{ minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }
		);
	const gridDimensions = {
		x: bounds.minx,
		y: bounds.miny,
		w: bounds.maxx - bounds.minx,
		h: bounds.maxy - bounds.miny,
	};
	const result: string[][] = [];
	for (let y = 0; y <= gridDimensions.h; ++y) {
		const row: string[] = [];
		result.push(row);
		for (let x = 0; x <= gridDimensions.w; ++x) {
			row.push(map[`${y + bounds.miny},${x + bounds.minx}`] || '.');
		}
	}
	return [result, gridDimensions] as const;
}

export function copyCells<T>(cells: T[][]) {
	return cells.map((i) => i.slice());
}

export function replaceCells<T>(
	cells: string[][],
	from: string | RegExp,
	to: T
) {
	return cells.map((i) => i.map((j) => (j.match(from) ? to : j)));
}

export function displayToPlacementProps(display: Container) {
	return {
		turns: (display.rotation / (Math.PI * 2)) * 4,
		flipH: display.scale.x < 0,
		flipV: display.scale.y < 0,
	};
}

export function rotateCellsByDisplay<T>(cells: T[][], display: Container) {
	const { turns, flipH, flipV } = displayToPlacementProps(display);
	let result = cells;
	result = rotateMatrixClockwise(result, turns);
	const flip = [flipH, flipV];
	if (turns % 2) flip.reverse();
	if (flip[0]) result = flipMatrixH(result);
	if (flip[1]) result = flipMatrixV(result);
	return result;
}

const cache: { [key: string]: Texture } = {};
export function makeCellsTexture(cells: string[][]) {
	const key = cells.join('|');
	if (cache[key]) return cache[key];
	const g = new Graphics();
	forCells(cells, (x, y, cell) => {
		g.rect(x * cellSize, y * cellSize, cellSize, cellSize);
	});
	g.fill(0xff0000);

	if (DEBUG) {
		game.app.renderer.extract.image(g).then((i) => {
			document.body.appendChild(i);
		});
	}

	cache[key] = game.app.renderer.extract.texture(g);
	return cache[key];
}
