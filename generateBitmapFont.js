const size = 32;
const border = 4;
const chars = 255;
const perRow = 16;
const template = `info face="bmfont" size=${size}
common lineHeight=${size * 1.25} base=${size}
page id=0 file="bmfont.1.png"
chars count=${chars}
${new Array(chars)
		.fill(0)
		.map(
			(_, idx) =>
				`char page=0 width=${size} height=${size} xoffset=0 yoffset=0 xadvance=${size} id=${idx} x=${
					(idx % perRow) * (size + border)
				} y=${Math.floor(idx / perRow) * (size + border)}`
		)
		.join('\n')}
`.trim();
copy(template);
