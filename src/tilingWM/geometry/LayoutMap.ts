import type { Rect } from "./Rect.js";

export class LayoutMap {
  readonly panels = new Map<string, Rect>();
  readonly gutters = new Map<string, Rect>();

  getPanelRect(panelId: string): Rect | undefined {
    return this.panels.get(panelId);
  }

  getGutterRect(splitId: string): Rect | undefined {
    return this.gutters.get(splitId);
  }
}
