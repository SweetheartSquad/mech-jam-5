import { Container, Sprite } from 'pixi.js';
import { cellSize } from './config';
import { forCells, makeCellsTexture, parseLayout } from './layout';
import { tex } from './utils';

export function mechModuleParse(key: string, source: string) {
	const [description, strMechanics, layout, strPivot] = source.split('\n---\n');
	const mechanics = strMechanics.split(/,\s?/);
	const cost = parseInt(mechanics.shift() || '0', 10);
	const { cells, w, h } = parseLayout(layout);
	let cellCount = 0;
	forCells(cells, (x, y, cell) => {
		if (cell === '0') {
			// basic cell
			++cellCount;
		} else if (cell === '.') {
			// empty
		} else {
			throw new Error(`invalid cell type "${cell}" in "${key}"`);
		}
	});
	let pivot: [number, number];
	if (strPivot) {
		pivot = strPivot.split(',').map((i) => parseInt(i)) as [number, number];
	} else {
		pivot = [Math.floor(w / 2), Math.floor(h / 2)];
	}
	return {
		name: key.replace(`module `, ''),
		description,
		cost,
		cellCount,
		tags: mechanics,
		tex: tex(key) === tex('error') ? makeCellsTexture(cells) : tex(key),
		cells,
		w,
		h,
		pivot,
	};
}

export type ModuleD = ReturnType<typeof mechModuleParse>;

export function makeModule(piece: ReturnType<typeof mechModuleParse>) {
	const containerCells = new Container();
	containerCells.label = piece.name;
	const sprBase = new Sprite(piece.tex);
	sprBase.label = piece.name;
	sprBase.anchor.x = sprBase.anchor.y = 0.5;
	containerCells.addChild(sprBase);
	containerCells.pivot.x = piece.pivot[0] * cellSize;
	containerCells.pivot.y = piece.pivot[1] * cellSize;
	sprBase.x += containerCells.pivot.x;
	sprBase.y += containerCells.pivot.y;
	return containerCells;
}
