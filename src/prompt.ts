import { keys } from './input-keys';

export class Prompt {
	elForm: HTMLFormElement;

	elInput: HTMLInputElement;

	focus: Element | null;

	constructor(
		onChange: (v: string) => void,
		onSubmit: () => void,
		{ defaultValue = '', min = 1, max = 256 } = {}
	) {
		this.elForm = document.createElement('form');
		// prevent form from affecting layout
		this.elForm.style.position = 'absolute';
		this.elForm.style.top = '0';
		this.elForm.style.left = '0';
		this.elForm.style.width = '100%';
		this.elForm.style.height = '100%';
		this.elForm.style.zIndex = '1';
		this.elForm.style.overflow = 'hidden';

		this.elInput = document.createElement('input');
		this.elInput.type = 'text';
		this.elInput.minLength = min;
		this.elInput.maxLength = max;
		this.elInput.required = true;
		this.elInput.oninput = this.elInput.onkeyup = () => {
			requestAnimationFrame(() => {
				const v = this.elInput.value;
				onChange(v);
			});
		};
		this.elInput.onblur = () => {
			this.elInput.focus();
		};
		// prevent zoom on focus
		this.elInput.style.position = 'absolute';
		this.elInput.style.top = '0';
		this.elInput.style.left = '0';
		this.elInput.style.width = '100%';
		this.elInput.style.height = '100%';
		this.elInput.style.padding = '0';
		this.elInput.style.margin = '0';
		this.elInput.style.border = 'none';
		this.elInput.style.outline = 'none';
		this.elInput.style.background = 'none';
		this.elInput.style.color = 'transparent';
		this.elInput.style.opacity = '0';

		this.elInput.value = defaultValue;

		this.elForm.onsubmit = (event) => {
			event.preventDefault();
			this.elForm.onsubmit = null;
			this.elInput.oninput = this.elInput.onkeyup = null;
			(this.focus as HTMLElement | null)?.focus();
			this.elForm.remove();
			this.elInput.remove();
			keys.enabled = true;
			onSubmit();
		};
		this.elForm.appendChild(this.elInput);
		document.body.appendChild(this.elForm);
		this.focus = document.activeElement;
		this.elInput.focus();
		keys.enabled = false;
	}
}
