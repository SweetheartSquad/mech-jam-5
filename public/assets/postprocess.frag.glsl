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

uniform vec2 camPos;
const vec2 size = vec2(256.0);
const vec2 ditherSize = vec2(8.0);
uniform float uNoise;
const float scale = 1.0;
const float posterize = 16.0;
const float brightness = 1.0;
const float contrast = 1.0;
const float PI = 3.14159;
const float PI2 = PI*2.0;

// https://stackoverflow.com/questions/12964279/whats-the-origin-of-this-glsl-rand-one-liner
float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
// https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
float noise(vec2 p){
	vec2 ip = floor(p);
	vec2 u = fract(p);
	u = u*u*(3.0-2.0*u);
	
	float res = mix(
		mix(rand(ip),rand(ip+vec2(1.0,0.0)),u.x),
		mix(rand(ip+vec2(0.0,1.0)),rand(ip+vec2(1.0,1.0)),u.x),u.y);
	return res*res;
}


vec3 tex(vec2 uv){
	return texture2D(uTexture, uv).rgb;
}
// chromatic abberation
vec3 chrAbb(vec2 uv, float separation, float rotation){
	vec2 o = 1.0/size * separation;
	return vec3(
		tex(uv + vec2(o.x*sin(PI2*1.0/3.0+rotation),o.y*cos(PI2*1.0/3.0+rotation))).r,
		tex(uv + vec2(o.x*sin(PI2*2.0/3.0+rotation),o.y*cos(PI2*2.0/3.0+rotation))).g,
		tex(uv + vec2(o.x*sin(PI2*3.0/3.0+rotation),o.y*cos(PI2*3.0/3.0+rotation))).b
	);
}
float vignette(vec2 uv, float amount){
	uv = uv;
	uv*=2.0;
	uv -= 1.0;
	return clamp((1.0-uv.y*uv.y)*(1.0-uv.x*uv.x)/amount, 0.0, 1.0);
}

void main(void) {
	// get pixels
	vec2 uv = vTextureCoord;
	float t = sin(mod(uCurTime/10.0,1.0)*PI2);
	
	vec2 coord = gl_FragCoord.xy;
	coord -= mod(coord, scale);

	vec2 uvDither = fract(coord / (ditherSize.xy * scale));
	// uvDither += camPos/ditherSize.xy; // camera-aligned dither
	vec2 uvPreview = uv;
	vec3 orig = texture2D(uTexture, uvPreview).rgb;

	vec2 noiseT1 = vec2(rand(vec2(0.0, t)), rand(vec2(t, 0.0)));
	vec2 noiseT = vec2(rand(vec2(0.0, t - mod(t, 0.4))), rand(vec2(t - mod(t, 0.4), 0.0)));
	// uv += (noise(uv*10.0 + noiseT)-0.5)*uNoise;

	vec3 col = chrAbb(uv, abs(uv.x-0.5)*2.0, 0.0);

	// fx
	col = (col - 0.5 + (brightness - 1.0)) * contrast + 0.5;
	col = mix(col, vec3(1.0), uWhiteout);
	col = mix(col, vec3(1.0) - col, uInvert);
	vec3 limit = texture2D(uDitherGridMap, uvDither).rgb;
	// col = mix(uBg, uFg, col) / 255.0;
	if (fract(uv.y * size.y * 0.5) > 0.5) col*= 0.5;

	// soft vignette
	float haze = 0.02;
	col *= (vignette(uv + noise(uv*5.0+t)*haze, 1.0)*0.75+0.25);
	// noise
	col += ((noise((uv+noiseT1)*size.xy*vec2(0.01, 1.0)) * noise((uv+noiseT1)*size.xy)) - 0.25)*(1.0-vignette(uv,1.0)*0.75)*uNoise;
	// hard edge vignette
	col *= vignette(uv, 0.05);
	
	// posterization
	vec3 raw = col;
	vec3 posterized = raw - mod(raw, 1.0/posterize);
	// dithering
	vec3 dither = step(limit, (raw-posterized)*posterize)/posterize;
	// output
	col = posterized + dither;
	finalColor = vec4(col, 1.0);

	// finalColor = vec4(texture2D(uTexture, uvPreview).rgb, 1.0);
}
