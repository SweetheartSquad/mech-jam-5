import type { TextStyle } from 'pixi.js';

const size = 8;

export const fontDialogue: Partial<TextStyle> = {
	fontFamily: 'bmfont',
	fontSize: size,
	padding: size * 0.5,
	fill: 0xffffff,
	align: 'left',
	lineHeight: size * 1.25,
	letterSpacing: 0,
};
export const fontPrompt: Partial<TextStyle> = {
	fontFamily: 'font',
	fontSize: size,
	padding: size * 0.5,
	fill: 0xffffff,
	align: 'center',
	lineHeight: size * 1.25,
	letterSpacing: 0,
	stroke: {
		color: 0,
		width: 2,
		join: 'round',
	},
};
export const fontIngame: Partial<TextStyle> = {
	fontFamily: 'font',
	fontSize: size,
	padding: size * 0.5,
	fill: 0xffffff,
	align: 'center',
	lineHeight: size * 1.25,
	letterSpacing: 0,
	stroke: {
		color: 0,
		width: 2,
		join: 'round',
	},
};
