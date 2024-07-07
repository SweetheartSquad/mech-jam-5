import { strReverse } from './utils';

export function parseLayout(source: string, flip = false) {
	const w = source
		.split('\n')
		.reduce((max, row) => Math.max(max, row.trimEnd().length), 0);
	const rows = source
		.replaceAll(' ', '.')
		.split('\n')
		.map((i) => i.substring(0, w).padEnd(w, '.'))
		.map((i) => (flip ? strReverse(i) : i).split(''));
	const h = rows.length;
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
