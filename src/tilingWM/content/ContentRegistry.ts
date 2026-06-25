import type { ContentInstance, ContentType } from "./ContentType.js";
import type { Panel } from "../model/Panel.js";

export class ContentRegistry {
  private readonly types = new Map<string, ContentType>();

  register(contentType: string, type: ContentType): this {
    this.types.set(contentType, type);
    return this;
  }

  has(contentType: string): boolean {
    return this.types.has(contentType);
  }

  create(
    contentType: string,
    container: HTMLElement,
    panel: Panel,
  ): ContentInstance {
    const type = this.types.get(contentType);
    if (!type) {
      throw new Error(`Unknown content type: ${contentType}`);
    }

    return type.create(container, panel);
  }

  getDefaultTitle(contentType: string): string {
    return this.types.get(contentType)?.getDefaultTitle() ?? contentType;
  }
}
