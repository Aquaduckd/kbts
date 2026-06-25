import type { Panel } from "../model/Panel.js";

export interface PanelRecord {
  panel: Panel;
  hidden: boolean;
}

export class PanelRegistry {
  private readonly records = new Map<string, PanelRecord>();

  register(panel: Panel, hidden = false): void {
    this.records.set(panel.id, { panel, hidden });
  }

  get(panelId: string): PanelRecord | undefined {
    return this.records.get(panelId);
  }

  getPanel(panelId: string): Panel | undefined {
    return this.records.get(panelId)?.panel;
  }

  update(panel: Panel): void {
    const record = this.records.get(panel.id);
    if (record) {
      record.panel = panel;
    }
  }

  hide(panelId: string): void {
    const record = this.records.get(panelId);
    if (record) {
      record.hidden = true;
    }
  }

  show(panelId: string): void {
    const record = this.records.get(panelId);
    if (record) {
      record.hidden = false;
    }
  }

  isHidden(panelId: string): boolean {
    return this.records.get(panelId)?.hidden ?? false;
  }

  getHiddenPanels(): Panel[] {
    return [...this.records.values()]
      .filter((record) => record.hidden)
      .map((record) => record.panel);
  }

  getVisiblePanels(): Panel[] {
    return [...this.records.values()]
      .filter((record) => !record.hidden)
      .map((record) => record.panel);
  }

  discard(panelId: string): Panel | undefined {
    const record = this.records.get(panelId);
    this.records.delete(panelId);
    return record?.panel;
  }
}
