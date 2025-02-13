import type { TextStyle } from 'pixi.js';
import { white } from './tints';

const size = 8;

export const fontDialogue: Partial<TextStyle> = {
	fontFamily: 'fontfnt',
	fontSize: size * 2,
	padding: 0,
	fill: white,
	align: 'left',
	lineHeight: size * 2 * 1.25,
	letterSpacing: 0,
};
export const fontx6: Partial<TextStyle> = {
	fontFamily: 'fontfnt',
	fontSize: size * 6,
	padding: 0,
	fill: white,
	align: 'left',
	lineHeight: size * 6 * 1.25,
	letterSpacing: 0,
};
export const fontMechInfo: Partial<TextStyle> = {
	fontFamily: 'fontfnt',
	fontSize: size,
	padding: 0,
	fill: white,
	align: 'left',
	lineHeight: size * 1.25,
	letterSpacing: 0,
};
