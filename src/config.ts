export const fps = 60;

export const cellSize = 16;
export const cellGap = 1;
export const csg = cellSize + cellGap;

export const size: {
	readonly x: number;
	readonly y: number;
} = {
	x: csg * 40,
	y: csg * 20,
};
