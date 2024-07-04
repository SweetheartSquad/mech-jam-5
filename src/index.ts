import { Resizer, ScaleModes } from './Resizer';
import { size } from './config';
import { DEBUG } from './debug';
import { error } from './logger';

let progress = 0;

function makeStr(mask: number) {
	return `Loading...\n${(mask * 100).toFixed(0)}%`;
}
document.querySelector('#preload')?.remove();
const progressEl = document.createElement('p');
progressEl.setAttribute('role', 'progressbar');
progressEl.setAttribute('aria-valuemin', '0');
progressEl.setAttribute('aria-valuemax', '100');
progressEl.textContent = makeStr(0);

// try to auto-focus and make sure the game can be focused with a click if run from an iframe
window.focus();
document.body.addEventListener('mousedown', () => {
	window.focus();
});

export const resizer = new Resizer(size.x, size.y, ScaleModes.MULTIPLES);
window.resizer = resizer;
document.body.appendChild(resizer.element);

const playEl = document.createElement('button');
playEl.id = 'play';
playEl.textContent = 'Play';
resizer.appendChild(playEl);

let hasErrored = false;
function fail(err: unknown) {
	hasErrored = true;
	progressEl.textContent = `Something went wrong - Sorry :(\n${
		err instanceof Error ? err.message : 'See console for details'
	}`;
	throw err;
}

function loadProgressHandler(p?: number) {
	if (hasErrored) return;
	if (p !== undefined) {
		progress = Math.max(1, Math.min(99, p));
	}
	const str = makeStr((progress || 0) / 100);
	progressEl.textContent = str;
	progressEl.setAttribute('aria-valuenow', (progress || 0).toString(10));
}

async function play() {
	let interval: ReturnType<typeof setInterval> | undefined;
	try {
		playEl.remove();

		resizer.appendChild(progressEl);

		// start the preload
		loadProgressHandler(0);
		interval = setInterval(() => {
			loadProgressHandler();
		}, 100);

		const [{ game }] = await Promise.all([import('./Game')]);
		// start the actual load
		loadProgressHandler(0);

		await game.load((p) => loadProgressHandler(p * 100));
		await game.init();
		progressEl.remove();
		resizer.appendChild(game.app.canvas);
	} catch (err) {
		error(err);
		fail(err);
	} finally {
		clearInterval(interval);
	}
}

playEl.onclick = play;
if (DEBUG) {
	playEl.click();
}
