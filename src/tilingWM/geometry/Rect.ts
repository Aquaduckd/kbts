export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Rect {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number,
  ) {}

  static fromElement(el: HTMLElement): Rect {
    return new Rect(0, 0, el.clientWidth, el.clientHeight);
  }

  contains(x: number, y: number): boolean {
    return (
      x >= this.x &&
      x <= this.x + this.width &&
      y >= this.y &&
      y <= this.y + this.height
    );
  }

  splitHorizontal(
    ratio: number,
    gutter: number,
  ): { first: Rect; second: Rect; gutter: Rect } {
    const inner = this.width - gutter;
    const firstWidth = inner * ratio;
    const secondWidth = inner - firstWidth;

    return {
      first: new Rect(this.x, this.y, firstWidth, this.height),
      gutter: new Rect(this.x + firstWidth, this.y, gutter, this.height),
      second: new Rect(
        this.x + firstWidth + gutter,
        this.y,
        secondWidth,
        this.height,
      ),
    };
  }

  splitVertical(
    ratio: number,
    gutter: number,
  ): { first: Rect; second: Rect; gutter: Rect } {
    const inner = this.height - gutter;
    const firstHeight = inner * ratio;
    const secondHeight = inner - firstHeight;

    return {
      first: new Rect(this.x, this.y, this.width, firstHeight),
      gutter: new Rect(this.x, this.y + firstHeight, this.width, gutter),
      second: new Rect(
        this.x,
        this.y + firstHeight + gutter,
        this.width,
        secondHeight,
      ),
    };
  }
}
