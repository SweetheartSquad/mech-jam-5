import { Container, Sprite } from 'pixi.js';
import { cellSize } from './config';
import { forCells, makeCellsTexture, parseLayout } from './layout';
import { flipMatrixH, tex } from './utils';

export function mechPartParse(
	type: string,
	key: string,
	source: string,
	flip = false
) {
	const { cells, w, h } = parseLayout(source, { flip });
	const joints: [number, number][] = [];
	forCells(cells, (x, y, cell) => {
		if (cell === '=') {
			joints.push([x, y]);
		} else if (cell === '0') {
			// basic cell
		} else if (cell === '.') {
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
				if (cells[y][x] === '=') {
					connections.armL = [x, y];
					break loop;
				}
			}
		}
		if (connections.armL[0] < 0)
			throw new Error(`could not find valid armL joint in "${key}"`);
		loop: for (let x = w - 1; x >= 0; --x) {
			for (let y = 0; y < h; ++y) {
				if (cells[y][x] === '=') {
					connections.armR = [x, y];
					break loop;
				}
			}
		}
		if (connections.armR[0] < 0)
			throw new Error(`could not find valid armR joint in "${key}"`);
		loop: for (let y = h - 1; y >= 0; --y) {
			for (let x = 0; x < w / 2; ++x) {
				if (cells[y][x] === '=') {
					connections.legL = [x, y];
					break loop;
				}
			}
		}
		if (connections.legL[0] < 0)
			throw new Error(`could not find valid legL joint in "${key}"`);
		loop: for (let y = h - 1; y >= 0; --y) {
			for (let x = w - 1; x >= 0; --x) {
				if (cells[y][x] === '=') {
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
				if (cells[y][x2] === '=') {
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
				if (cells[y][x] === '=') {
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
				if (cells[y][x] === '=') {
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
				if (cells[y][x2] === '=') {
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
		tex:
			tex(key) === tex('error')
				? makeCellsTexture(flip ? flipMatrixH(cells) : cells)
				: tex(key),
		cells,
		w,
		h,
		connections,
	};
}

export type MechD = ReturnType<typeof mechPartParse>;

export function makePart(piece: ReturnType<typeof mechPartParse>) {
	const sprBase = new Sprite(piece.tex);
	sprBase.label = `${piece.name} sprite`;
	const containerCells = new Container();
	containerCells.label = `${piece.name} cells`;
	sprBase.anchor.x = sprBase.anchor.y = 0.5;
	forCells(piece.cells, (x, y) => {
		const sprCell = new Sprite(tex('blank'));
		sprCell.anchor.x = sprCell.anchor.y = 0;
		sprCell.x = x * cellSize;
		sprCell.y = y * cellSize;
		sprCell.width = cellSize;
		sprCell.height = cellSize;
		containerCells.addChild(sprCell);
	});
	return [sprBase, containerCells];
}
