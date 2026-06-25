import type { Panel } from "../model/Panel.js";
import type { ContentInstance } from "./ContentType.js";
import { ContentRegistry } from "./ContentRegistry.js";
import type { StatePool } from "../state/StatePool.js";

interface CachedInstance {
  instance: ContentInstance;
  contentType: string;
  active: boolean;
}

export class ContentHost {
  private readonly cache = new Map<string, Map<string, CachedInstance>>();
  private readonly stateCleanups = new Map<string, () => void>();

  constructor(
    private readonly registry: ContentRegistry,
    private readonly statePool: StatePool,
  ) {}

  sync(
    panels: Panel[],
    getContainer: (panelId: string) => HTMLElement | null,
    focusedPanelId: string | null,
  ): void {
    const visibleIds = new Set(panels.map((panel) => panel.id));

    for (const panelId of this.cache.keys()) {
      if (!visibleIds.has(panelId)) {
        this.deactivatePanel(panelId);
      }
    }

    for (const panel of panels) {
      const container = getContainer(panel.id);
      if (!container) {
        continue;
      }

      this.syncPanel(panel, container);
    }

    for (const panel of panels) {
      const active = this.getActiveInstance(panel.id);
      if (!active) {
        continue;
      }

      if (panel.id === focusedPanelId) {
        active.onFocus();
      } else {
        active.onBlur();
      }
    }
  }

  notifyResize(panelId: string, width: number, height: number): void {
    this.getActiveInstance(panelId)?.onResize(width, height);
  }

  getInstance(panelId: string): ContentInstance | undefined {
    return this.getActiveInstance(panelId);
  }

  getInstanceForType(
    panelId: string,
    contentType: string,
  ): ContentInstance | undefined {
    return this.cache.get(panelId)?.get(contentType)?.instance;
  }

  destroyPanel(panelId: string): void {
    const typeMap = this.cache.get(panelId);
    if (!typeMap) {
      return;
    }

    for (const cached of typeMap.values()) {
      cached.instance.destroy();
    }

    this.withdrawState(panelId);
    this.cache.delete(panelId);
  }

  private syncPanel(panel: Panel, container: HTMLElement): void {
    const typeMap = this.getOrCreateTypeMap(panel.id);

    for (const [contentType, cached] of typeMap) {
      if (contentType !== panel.contentType && cached.active) {
        cached.instance.deactivate();
        cached.active = false;
        this.withdrawState(panel.id);
      }
    }

    let cached = typeMap.get(panel.contentType);
    if (!cached) {
      const instance = this.registry.create(
        panel.contentType,
        container,
        panel,
      );
      instance.mount();
      instance.activate(container, panel);
      this.bindState(instance, panel);
      cached = {
        instance,
        contentType: panel.contentType,
        active: true,
      };
      typeMap.set(panel.contentType, cached);
      return;
    }

    if (!cached.active) {
      cached.instance.activate(container, panel);
      cached.active = true;
      this.bindState(cached.instance, panel);
    }
  }

  private bindState(instance: ContentInstance, panel: Panel): void {
    this.withdrawState(panel.id);
    const cleanup = instance.exposeState?.(this.statePool, panel);
    if (cleanup) {
      this.stateCleanups.set(panel.id, cleanup);
    }
  }

  private withdrawState(panelId: string): void {
    this.stateCleanups.get(panelId)?.();
    this.stateCleanups.delete(panelId);
  }

  private deactivatePanel(panelId: string): void {
    this.withdrawState(panelId);

    const typeMap = this.cache.get(panelId);
    if (!typeMap) {
      return;
    }

    for (const cached of typeMap.values()) {
      if (!cached.active) {
        continue;
      }

      cached.instance.deactivate();
      cached.active = false;
    }
  }

  private getOrCreateTypeMap(panelId: string): Map<string, CachedInstance> {
    let typeMap = this.cache.get(panelId);
    if (!typeMap) {
      typeMap = new Map();
      this.cache.set(panelId, typeMap);
    }

    return typeMap;
  }

  private getActiveInstance(panelId: string): ContentInstance | undefined {
    const typeMap = this.cache.get(panelId);
    if (!typeMap) {
      return undefined;
    }

    for (const cached of typeMap.values()) {
      if (cached.active) {
        return cached.instance;
      }
    }

    return undefined;
  }
}
