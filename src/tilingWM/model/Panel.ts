import { LayoutNode } from "./LayoutNode.js";

export class Panel extends LayoutNode {
  constructor(
    id: string,
    readonly title: string,
    readonly contentType: string,
    readonly minWidth = 120,
    readonly minHeight = 80,
  ) {
    super(id);
  }

  withTitle(title: string): Panel {
    return new Panel(
      this.id,
      title,
      this.contentType,
      this.minWidth,
      this.minHeight,
    );
  }

  withContentType(contentType: string, title?: string): Panel {
    return new Panel(
      this.id,
      title ?? this.title,
      contentType,
      this.minWidth,
      this.minHeight,
    );
  }
}
