import { Container, Sprite } from 'pixi.js';
import { cellSize } from './config';
import { forCells, parseLayout } from './layout';
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
		tex: tex(key),
		cells,
		w,
		h,
	};
}

export function makeModule(piece: ReturnType<typeof mechModuleParse>) {
	const sprBase = new Sprite(piece.tex);
	sprBase.label = `${piece.name} sprite`;
	const containerCells = new Container();
	containerCells.label = piece.name;
	sprBase.anchor.x = sprBase.anchor.y = 0.5;
	forCells(piece.cells, (x, y, cell) => {
		const sprCell = new Sprite(
			tex({ 0: 'cell empty', '=': 'cell joint' }[cell] || cell)
		);
		sprCell.anchor.x = sprCell.anchor.y = 0;
		sprCell.x = x * cellSize;
		sprCell.y = y * cellSize;
		sprCell.width = cellSize;
		sprCell.height = cellSize;
		sprCell.alpha = 0.25; // TODO: should these be visible?
		containerCells.addChild(sprCell);
	});
	sprBase.x += containerCells.width / 2;
	sprBase.y += containerCells.height / 2;
	containerCells.addChild(sprBase);
	containerCells.pivot.x = containerCells.width / 2;
	containerCells.pivot.y = containerCells.height / 2;
	return containerCells;
}
