import { Container, Graphics, Texture } from 'pixi.js';
import { cellSize } from './config';
import { DEBUG } from './debug';
import { game } from './Game';
import { black, white } from './tints';
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

export function forCells<T>(
	rows: T[][],
	cb: (x: number, y: number, cell: T) => void
) {
	rows.forEach((row, y) =>
		row.forEach((cell, x) => {
			if (!cell || !`${cell}`.trim() || cell === '.') return; // skip empties
			cb(x, y, cell);
		})
	);
}

export function flatten<T extends string>(
	entries: { cells: T[][]; x: number; y: number }[]
) {
	const map: { [key: string]: T } = {};
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

/** @returns orthogonal neighbours (i.e. cell above, below, to the right, to the left). excludes empties and outside boundaries */
export function getNeighbours<T>(cells: T[][], x: number, y: number) {
	const result: [number, number][] = [];
	const up = cells[y - 1]?.[x];
	const down = cells[y + 1]?.[x];
	const left = cells[y]?.[x - 1];
	const right = cells[y]?.[x + 1];
	if (up !== undefined && up !== '.') result.push([x, y - 1]);
	if (down !== undefined && down !== '.') result.push([x, y + 1]);
	if (left !== undefined && left !== '.') result.push([x - 1, y]);
	if (right !== undefined && right !== '.') result.push([x + 1, y]);
	return result;
}

/** @returns list of positions in neighbourhood of given position that match its value (i.e. magic wand) */
export function getFlood<T>(cells: T[][], x: number, y: number) {
	const result: [number, number][] = [];
	const target = cells[y][x];
	const checked: { [key: string]: boolean } = {};
	checked[xyKey(x, y)] = false;
	const check = (x: number, y: number): void => {
		const key = xyKey(x, y);
		if (checked[key]) return;
		if (cells[y]?.[x] !== target) return;
		result.push([x, y]);
		checked[key] = true;
		getNeighbours(cells, x, y).forEach((i) => check(...i));
	};
	check(x, y);
	return result;
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
	g.beginPath();
	forCells(cells, (x, y, cell) => {
		g.rect(x * cellSize - 2, y * cellSize - 2, cellSize + 4, cellSize + 4);
	});
	g.fill({
		color: white,
	});
	g.beginPath();
	forCells(cells, (x, y, cell) => {
		g.rect(x * cellSize, y * cellSize, cellSize, cellSize);
	});
	g.fill({
		color: black,
		alpha: 1 - 63 / 255,
	});

	if (DEBUG) {
		game.app.renderer.extract.image(g).then((i) => {
			document.body.appendChild(i);
		});
	}

	cache[key] = game.app.renderer.extract.texture(g);
	return cache[key];
}

export function xyKey(x: number, y: number) {
	return `${x},${y}`;
}
export function keyXY(key: string) {
	return key.split(',').map((i) => parseInt(i, 10));
}
