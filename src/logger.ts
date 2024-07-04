/* eslint-disable no-console */
export function log(...args: Parameters<typeof console['log']>) {
	return console.log(...args);
}
export function warn(...args: Parameters<typeof console['warn']>) {
	return console.warn(...args);
}
export function error(...args: Parameters<typeof console['error']>) {
	return console.error(...args);
}
