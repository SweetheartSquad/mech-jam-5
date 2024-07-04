precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uWhiteout;
uniform float uInvert;
uniform vec2 uCamPos;

#ifdef GL_FRAGMENT_PRECISION_HIGH
	uniform highp float uCurTime;
#else
	uniform float uCurTime;
#endif

uniform sampler2D uDitherGridMap;
uniform vec3 uBg;
uniform vec3 uFg;

const vec2 ditherSize = vec2(8.0);
const float scale = 1.0;
const float posterize = 1.0;
const float brightness = 1.0;
const float contrast = 1.0;

void main(void) {
	// get pixels
	vec2 uv = vTextureCoord;
	// float t = mod(curTime,1.0);
	
	vec2 coord = gl_FragCoord.xy;
	coord -= mod(coord, scale);

	vec2 uvDither = fract(coord / (ditherSize.xy * scale));
	// uvDither += camPos/ditherSize.xy; // camera-aligned dither
	vec2 uvPreview = uv;
	vec3 orig = texture2D(uTexture, uvPreview).rgb;

	// vec3 col = (orig - 0.5 + (brightness - 1.0)) * contrast + 0.5;
	// col = mix(col, vec3(1.0), uWhiteout);
	// vec3 limit = texture2D(uDitherGridMap, uvDither).rgb;
	// col = mix(uBg, uFg, col) / 255.0;

	// // posterization
	// vec3 raw = col;
	// vec3 posterized = raw - mod(raw, 1.0/posterize);
	// // dithering
	// vec3 dither = step(limit, (raw-posterized)*posterize)/posterize;
	// // output
	// col = posterized + dither;
	// finalColor = vec4(col, 1.0);

	finalColor = vec4(orig, 1.0);
}
