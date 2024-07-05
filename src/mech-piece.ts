import { Container, Sprite } from 'pixi.js';
import { cellGap, cellSize } from './config';
import { tex } from './utils';

type Connection = 'A' | 'L' | 'C' | 'H';

export function mechPieceParse(type: string, key: string, source: string) {
	const rows = source
		.split('\n')
		.filter((i) => i.trim())
		.map((i) => i.trimEnd().split(''));
	const w = rows.reduce((max, row) => Math.max(max, row.length), 0);
	const h = rows.length;
	const connections: Record<Connection, [number, number][]> = {
		A: [],
		L: [],
		C: [],
		H: [],
	};
	forCells(rows, (x, y, cell) => {
		if (['A', 'L', 'C', 'H'].includes(cell)) {
			connections[cell as Connection].push([x, y]);
		}
	});
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
			if (!cell.trim()) return; // skip empties
			cb(x, y, cell);
		})
	);
}

export function makePiece(piece: ReturnType<typeof mechPieceParse>) {
	const sprBase = new Sprite(piece.tex);
	const containerCells = new Container();
	sprBase.anchor.x = sprBase.anchor.y = 0.5;
	forCells(piece.cells, (x, y, cell) => {
		const sprCell = new Sprite(
			cell === 'O' ? tex('cell empty') : tex('cell joint')
		);
		sprCell.anchor.x = sprCell.anchor.y = 0.5;
		sprCell.x = (x - piece.w / 2 + 0.5) * (cellSize + cellGap);
		sprCell.y = (y - piece.h / 2 + 0.5) * (cellSize + cellGap);
		containerCells.addChild(sprCell);
	});
	return [sprBase, containerCells];
}
