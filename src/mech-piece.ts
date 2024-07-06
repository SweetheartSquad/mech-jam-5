import { Container, Sprite } from 'pixi.js';
import { cellSize } from './config';
import { strReverse, tex } from './utils';

export function mechPieceParse(
	type: string,
	key: string,
	source: string,
	flip = false
) {
	const w = source
		.split('\n')
		.reduce((max, row) => Math.max(max, row.trimEnd().length), 0);
	const rows = source
		.split('\n')
		.map((i) => i.substring(0, w).padEnd(w, ' '))
		.map((i) => (flip ? strReverse(i) : i).split(''));
	console.log(source, rows);
	const h = rows.length;
	const joints: [number, number][] = [];
	forCells(rows, (x, y, cell) => {
		if (cell === '=') {
			joints.push([x, y]);
		} else if (cell === '0') {
			// basic cell
		} else if (!cell.trim() || cell === '.') {
			// empty
		} else {
			throw new Error(`invalid cell type "${cell}" in "${key}"`);
		}
	});
	const connections: Record<
		'armL' | 'armR' | 'chest' | 'head' | 'legL' | 'legR',
		[number, number]
	> = {
		armL: [-1, -1],
		armR: [-1, -1],
		chest: [-1, -1],
		head: [-1, -1],
		legL: [-1, -1],
		legR: [-1, -1],
	};
	if (type === 'chest') {
		loop: for (let x = 0; x < w / 2; ++x) {
			for (let y = 0; y < h; ++y) {
				if (rows[y][x] === '=') {
					connections.armL = [x, y];
					break loop;
				}
			}
		}
		if (connections.armL[0] < 0)
			throw new Error(`could not find valid armL joint in "${key}"`);
		loop: for (let x = w - 1; x >= 0; --x) {
			for (let y = 0; y < h; ++y) {
				if (rows[y][x] === '=') {
					connections.armR = [x, y];
					break loop;
				}
			}
		}
		if (connections.armR[0] < 0)
			throw new Error(`could not find valid armR joint in "${key}"`);
		loop: for (let y = h - 1; y >= 0; --y) {
			for (let x = 0; x < w / 2; ++x) {
				if (rows[y][x] === '=') {
					connections.legL = [x, y];
					break loop;
				}
			}
		}
		if (connections.legL[0] < 0)
			throw new Error(`could not find valid legL joint in "${key}"`);
		loop: for (let y = h - 1; y >= 0; --y) {
			for (let x = w - 1; x >= 0; --x) {
				if (rows[y][x] === '=') {
					connections.legR = [x, y];
					break loop;
				}
			}
		}
		if (connections.legR[0] < 0)
			throw new Error(`could not find valid legR joint in "${key}"`);
		loop: for (let y = 0; y < h / 2; ++y) {
			for (let x = 0; x < w; ++x) {
				const x2 = (x + Math.floor(w / 2)) % w;
				if (rows[y][x2] === '=') {
					connections.head = [x2, y];
					break loop;
				}
			}
		}
		if (connections.head[0] < 0)
			throw new Error(`could not find valid head joint in "${key}"`);
	} else if (type === 'leg') {
		loop: for (let y = 0; y < h; ++y) {
			for (let x = w - 1; x >= 0; --x) {
				if (rows[y][x] === '=') {
					connections.chest = [x, y];
					break loop;
				}
			}
		}
		if (connections.chest[0] < 0)
			throw new Error(`could not find valid chest joint in "${key}"`);
	} else if (type === 'arm') {
		loop: for (let x = w - 1; x >= 0; --x) {
			for (let y = 0; y < h; ++y) {
				if (rows[y][x] === '=') {
					connections.chest = [x, y];
					break loop;
				}
			}
		}
		if (connections.chest[0] < 0)
			throw new Error(`could not find valid chest joint in "${key}"`);
	} else if (type === 'head') {
		loop: for (let y = h - 1; y >= 0; --y) {
			for (let x = 0; x < w; ++x) {
				const x2 = (x + Math.floor(w / 2)) % w;
				if (rows[y][x2] === '=') {
					connections.chest = [x2, y];
					break loop;
				}
			}
		}
		if (connections.chest[0] < 0)
			throw new Error(`could not find valid chest joint in "${key}"`);
	}
	return {
		name: key.replace(`${type} `, ''),
		tex: tex(key),
		cells: rows,
		w,
		h,
		connections,
	};
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

export function makePiece(piece: ReturnType<typeof mechPieceParse>) {
	const sprBase = new Sprite(piece.tex);
	const containerCells = new Container();
	const tint = Math.random() * 0xffffff;
	sprBase.anchor.x = sprBase.anchor.y = 0.5;
	forCells(piece.cells, (x, y, cell) => {
		const sprCell = new Sprite(
			cell === '0' ? tex('cell empty') : tex('cell joint')
		);
		sprCell.anchor.x = sprCell.anchor.y = 0;
		sprCell.x = x * cellSize;
		sprCell.y = y * cellSize;
		sprCell.width = cellSize;
		sprCell.height = cellSize;
		// sprCell.tint = tint;
		containerCells.addChild(sprCell);
	});
	return [sprBase, containerCells];
}
