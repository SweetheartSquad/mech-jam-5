import { Filter, GlProgram, Texture, defaultFilterVert } from 'pixi.js';

function getType(value: number | number[] | Texture) {
	if (typeof value === 'number') return 'f32';
	if (Array.isArray(value)) return `vec${value.length}<f32>`;
	return 'texture';
}

export class CustomFilter<
	T extends Record<string, number | number[] | Texture>
> extends Filter {
	constructor(fragmentSource: string, uniforms?: T) {
		const uniformMap = Object.entries(uniforms || {}).map(([key, value]) => [
			key,
			value,
			getType(value),
		]);
		super({
			glProgram: GlProgram.from({
				vertex: defaultFilterVert,
				fragment: fragmentSource,
			}),
			resources: {
				customUniforms: Object.fromEntries(
					uniformMap
						.filter(([, , type]) => type !== 'texture')
						.map(([key, value, type]) => [key, { value, type }])
				),
				...Object.fromEntries(
					uniformMap
						.filter(([, , type]) => type === 'texture')
						.map(([key, value]) => [key, (value as Texture).source])
				),
			},
		});
	}

	get uniforms(): T {
		return this.resources.customUniforms.uniforms;
	}
}
