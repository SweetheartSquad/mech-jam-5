import { BitmapText } from 'pixi.js';
import { Btn } from './Btn';
import { fontDialogue } from './font';

export class BtnText extends Btn {
	constructor(
		str: string,
		onClick: ConstructorParameters<typeof Btn>[0],
		title?: ConstructorParameters<typeof Btn>[2]
	) {
		super(onClick, 'button', title);
		const text = new BitmapText({ text: str, style: fontDialogue });
		this.display.container.addChild(text);
		text.x -= text.width / 2;
		text.y -= text.height / 2;
		text.x += 4;
	}
}
