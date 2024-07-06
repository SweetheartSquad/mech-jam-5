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
