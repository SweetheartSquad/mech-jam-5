import { Howl, Howler } from 'howler';
import { resource } from './Game';
import { warn } from './logger';
import { delay } from './utils';

let muted = false;
export function toggleMute(): void {
	if (muted) {
		Howler.mute(false);
	} else {
		Howler.mute(true);
	}
	muted = !muted;
}

export function getHowl(howl: string) {
	const h = resource<Howl>(howl);
	if (!h) {
		warn(`Audio "${howl}" not found`);
	}
	return h;
}

let musicPlaying:
	| {
			music: string;
			howl: Howl;
			id: number;
			volume: number;
			rate: number;
	  }
	| undefined;

export function getMusic() {
	return musicPlaying;
}

export function sfx(
	sfxName: string,
	{
		rate = 1,
		volume = 1,
		loop = false,
	}: { rate?: number; volume?: number; loop?: boolean } = {}
) {
	const howl = getHowl(sfxName);
	if (!howl) return undefined;
	const id = howl.play();
	howl.rate(rate, id);
	howl.loop(loop, id);
	howl.volume(volume, id);
	return id;
}

const musicHowls: { [key: string]: number } = {};
export function music(
	musicName: string,
	{
		rate = 1,
		volume = 0.5,
		fade = 1000,
		restart = false,
	}: {
		rate?: number;
		volume?: number;
		fade?: number;
		/** if true, restarts track; if false, resumes track */
		restart?: boolean;
	} = {}
) {
	const playing = musicPlaying;
	if (
		playing?.music === musicName &&
		playing.volume === volume &&
		playing.rate === rate
	)
		return playing.id;
	if (playing) {
		playing.howl.fade(playing.volume, 0, fade, playing.id);
		delay(fade).then(() => {
			if (playing.music !== musicPlaying?.music) {
				playing.howl.pause(playing.id);
			}
		});
	}
	musicPlaying = undefined;
	if (!musicName) {
		if (restart && playing) {
			playing.howl.stop(playing.id);
			delete musicHowls[playing.music];
		}
		return undefined;
	}
	const howl = getHowl(musicName);
	if (!howl) return undefined;
	let id = musicHowls[musicName];
	if (id) {
		if (restart) {
			howl.stop(id);
		}
		howl.play(id);
	} else {
		id = howl.play();
		musicHowls[musicName] = id;
	}
	howl.rate(rate, id);
	howl.loop(true, id);
	howl.fade(0, volume, fade, id);
	musicPlaying = {
		music: musicName,
		howl,
		id,
		volume,
		rate,
	};
	return id;
}
