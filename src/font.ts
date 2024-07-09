import type { TextStyle } from 'pixi.js';

const size = 8;

export const fontDialogue: Partial<TextStyle> = {
	fontFamily: 'fontfnt',
	fontSize: size * 2,
	padding: size * 2 * 0.5,
	fill: 0xffffff,
	align: 'left',
	lineHeight: size * 2 * 1.25,
	letterSpacing: -2,
};
export const fontMechInfo: Partial<TextStyle> = {
	fontFamily: 'fontfnt',
	fontSize: size,
	padding: size * 0.5,
	fill: 0xffffff,
	align: 'left',
	lineHeight: size * 1.25,
	letterSpacing: 0,
};
