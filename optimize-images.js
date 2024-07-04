/* eslint-disable no-console */
import imageminOxipng from '@vheemstra/imagemin-oxipng';
import { sync } from 'glob';
import imagemin from 'imagemin';
import imageminJpeg from 'imagemin-jpeg-recompress';
import imageminWebp from 'imagemin-webp';
import { dirname, extname } from 'path';

const globPattern = process.argv[2] || '*';

const plugins = {
	jpg: imageminJpeg(),
	png: imageminOxipng({
		preserve: false,
		strip: true,
		optimization: 'max',
	}),
	webp: imageminWebp({
		method: 6,
		autoFilter: true,
		quality: 90,
	}),
};

(() =>
	sync(`{public,src}/**/${globPattern}.{png,jpg,webp}`).reduce(
		async (acc, file) => {
			await acc;
			console.log(file);
			return imagemin([file], {
				destination: dirname(file),
				plugins: [plugins[extname(file).replace('.', '')]],
			});
		},
		Promise.resolve()
	))()
	.then(() => {
		console.log('✅');
	})
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
