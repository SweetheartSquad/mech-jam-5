import { Container, Sprite } from 'pixi.js';
import {
	costMultAwkward,
	costMultFlexible,
	costPerArmourCell,
	costPerAttack,
	costPerCockpitCell,
	costPerHeatsink,
	costPerJointExtendCell,
	costPerModuleCell,
	costPerRadar,
	costPerShield,
} from './costs';
import { forCells, makeCellsTexture, parseLayout } from './layout';
import { tex } from './utils';

export function mechModuleParse(key: string, source: string) {
	const [description, strMechanics, layout, strPivot] = source.split('\n---\n');
	const mechanics = strMechanics.split(/,\s?/);
	const strCost = mechanics.shift() || 'auto';
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
	let cost = Number(strCost);
	if (Number.isNaN(cost)) {
		cost = 0;
	}
	if (
		Number.isNaN(Number(strCost)) ||
		strCost.startsWith('+') ||
		strCost.startsWith('-')
	) {
		mechanics.forEach((i) => {
			switch (i) {
				case 'attack':
					cost += costPerAttack;
					break;
				case 'radar':
					cost += costPerRadar;
					break;
				case 'shield':
					cost += costPerShield;
					break;
				case 'heatsink':
					cost += costPerHeatsink;
					break;
			}
		});
		forCells(cells, () => {
			cost += costPerModuleCell;
			mechanics.forEach((i) => {
				switch (i) {
					case 'cockpit':
						cost += costPerCockpitCell;
						break;
					case 'armour':
						cost += costPerArmourCell;
						break;
					case 'joint':
						cost += costPerJointExtendCell;
				}
			});
		});
		mechanics.forEach((i) => {
			switch (i) {
				case 'awkward':
					cost *= costMultAwkward;
					break;
				case 'flexible':
					cost *= costMultFlexible;
					break;
			}
		});
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

	containerCells.addChild(sprBase);
	sprBase.anchor.x = (piece.pivot[0] + 0.5) / piece.w;
	sprBase.anchor.y = (piece.pivot[1] + 0.5) / piece.h;

	// const sprPivot = new Sprite(tex('white'));
	// sprPivot.tint = green;
	// sprPivot.width = cellSize / 4;
	// sprPivot.height = cellSize / 4;
	// sprPivot.anchor.x = sprBase.anchor.x;
	// sprPivot.anchor.y = sprBase.anchor.y;
	// containerCells.addChild(sprPivot);

	return containerCells;
}
