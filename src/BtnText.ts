import { BitmapText } from 'pixi.js';
import { Btn } from './Btn';
import { fontDialogue } from './font';

export class BtnText extends Btn {
	text: BitmapText;
	constructor(
		str: string,
		onClick: ConstructorParameters<typeof Btn>[0],
		title?: ConstructorParameters<typeof Btn>[2]
	) {
		super(onClick, 'button', title || str);
		this.text = new BitmapText({ text: str, style: fontDialogue });
		this.display.container.addChild(this.text);
		this.text.x -= this.text.width / 2;
		this.text.y -= this.text.height / 2;
		this.text.x += 4;
	}

	setText(str: string) {
		this.text.text = str;
		this.text.x = -this.text.width / 2;
		this.text.y = -this.text.height / 2;
		this.text.x += 4;
	}
}
