import { Container, Sprite } from 'pixi.js';
import { cellSize } from './config';
import { forCells, makeCellsTexture, parseLayout } from './layout';
import { tex } from './utils';

export function mechModuleParse(key: string, source: string) {
	const [description, strMechanics, layout] = source.split('\n---\n');
	const mechanics = strMechanics.split(/,\s?/);
	const cost = parseInt(mechanics.shift() || '0', 10);
	const { cells, w, h } = parseLayout(layout);
	forCells(cells, (x, y, cell) => {
		if (cell === '0') {
			// basic cell
		} else if (cell === '.') {
			// empty
		} else {
			throw new Error(`invalid cell type "${cell}" in "${key}"`);
		}
	});
	return {
		name: key.replace(`module `, ''),
		description,
		cost,
		tags: mechanics,
		tex: tex(key) === tex('error') ? makeCellsTexture(cells) : tex(key),
		cells,
		w,
		h,
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
	containerCells.pivot.x = (piece.w / 2) * cellSize;
	containerCells.pivot.y = (piece.h / 2) * cellSize;
	sprBase.x += containerCells.pivot.x;
	sprBase.y += containerCells.pivot.y;
	return containerCells;
}
