import type { Panel } from "../model/Panel.js";

export interface SharedStateDescriptor {
  key: string;
  label?: string;
}

export interface StateProvider {
  readonly contentType: string;
  get<T>(key: string): T | undefined;
  keys(): readonly string[];
}

export type StateWatchTarget =
  | { kind: "state"; contentType: string; key: string }
  | { kind: "pool" };

export interface StateWatchDescriptor {
  listenerContentType: string;
  target: StateWatchTarget;
}

interface TrackedWatch {
  listener: () => void;
  descriptor: StateWatchDescriptor;
}

type StatePoolEvent =
  | { type: "register"; contentType: string; key: string }
  | { type: "unregister"; contentType: string; key: string }
  | { type: "change"; contentType: string; key: string };

export type StatePoolReactTrigger =
  | { kind: "pool" }
  | {
      kind: "state";
      event: "provide" | "withdraw" | "change";
      contentType: string;
      key: string;
    };

export type StatePoolLogEvent = { at: number } & (
  | { type: "declare"; contentType: string; keys: readonly string[] }
  | { type: "provide"; contentType: string; key: string }
  | { type: "withdraw"; contentType: string; key: string }
  | { type: "change"; contentType: string; key: string }
  | { type: "watch"; listenerContentType: string; target: StateWatchTarget }
  | { type: "unwatch"; listenerContentType: string; target: StateWatchTarget }
  | { type: "react"; listenerContentType: string; trigger: StatePoolReactTrigger }
);

export type StatePoolLogListener = (event: StatePoolLogEvent) => void;

const MAX_LOG_ENTRIES = 500;

export function formatReactTrigger(trigger: StatePoolReactTrigger): string {
  if (trigger.kind === "pool") {
    return "pool";
  }

  return `${trigger.event} ${trigger.contentType}.${trigger.key}`;
}

export function formatStatePoolLogEvent(event: StatePoolLogEvent): string {
  const date = new Date(event.at);
  const time = date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  const stamp = `${time}.${ms}`;

  switch (event.type) {
    case "declare":
      return `${stamp}  declare  ${event.contentType}  [${event.keys.join(", ")}]`;
    case "provide":
      return `${stamp}  provide  ${event.contentType}.${event.key}`;
    case "withdraw":
      return `${stamp}  withdraw  ${event.contentType}.${event.key}`;
    case "change":
      return `${stamp}  change  ${event.contentType}.${event.key}`;
    case "react":
      return `${stamp}    → react  ${event.listenerContentType}  ← ${formatReactTrigger(event.trigger)}`;
    case "watch":
      return `${stamp}  watch  ${event.listenerContentType} → ${formatWatchTarget(event.target)}`;
    case "unwatch":
      return `${stamp}  unwatch  ${event.listenerContentType} → ${formatWatchTarget(event.target)}`;
  }
}

export function createStateProvider(
  contentType: string,
  states: Record<string, () => unknown>,
): StateProvider {
  const keys = Object.freeze(Object.keys(states));

  return {
    contentType,
    keys: () => keys,
    get<T>(key: string): T | undefined {
      const getter = states[key];
      if (!getter) {
        return undefined;
      }

      return getter() as T;
    },
  };
}

export function formatWatchTarget(target: StateWatchTarget): string {
  if (target.kind === "pool") {
    return "pool";
  }

  return `${target.contentType}.${target.key}`;
}

export class StatePool {
  private readonly providers = new Map<string, StateProvider>();
  private readonly providerTokens = new Map<string, symbol>();
  private readonly typeCatalog = new Map<string, SharedStateDescriptor[]>();
  private readonly watches = new Map<string, TrackedWatch>();
  private readonly log: StatePoolLogEvent[] = [];
  private readonly logListeners = new Set<StatePoolLogListener>();
  private nextWatchId = 1;

  registerTypeCatalog(
    contentType: string,
    states: readonly SharedStateDescriptor[],
  ): void {
    this.typeCatalog.set(contentType, [...states]);
    this.recordLog({
      type: "declare",
      contentType,
      keys: states.map((state) => state.key),
      at: Date.now(),
    });
  }

  catalogForType(contentType: string): readonly SharedStateDescriptor[] {
    return this.typeCatalog.get(contentType) ?? [];
  }

  register(provider: StateProvider): () => void {
    const token = Symbol(provider.contentType);
    this.providers.set(provider.contentType, provider);
    this.providerTokens.set(provider.contentType, token);

    for (const key of provider.keys()) {
      this.recordLog({ type: "provide", contentType: provider.contentType, key, at: Date.now() });
      this.notifyMatchingWatches({ type: "register", contentType: provider.contentType, key });
    }

    return () => this.unregister(provider.contentType, token);
  }

  unregister(contentType: string, token?: symbol): void {
    if (token && this.providerTokens.get(contentType) !== token) {
      return;
    }

    const provider = this.providers.get(contentType);
    if (!provider) {
      return;
    }

    this.providers.delete(contentType);
    this.providerTokens.delete(contentType);

    for (const key of provider.keys()) {
      this.recordLog({ type: "withdraw", contentType, key, at: Date.now() });
      this.notifyMatchingWatches({ type: "unregister", contentType, key });
    }
  }

  notifyChange(contentType: string, key: string): void {
    if (!this.providers.has(contentType)) {
      return;
    }

    this.recordLog({ type: "change", contentType, key, at: Date.now() });
    this.notifyMatchingWatches({ type: "change", contentType, key });
  }

  get<T>(contentType: string, key: string): T | undefined {
    return this.providers.get(contentType)?.get<T>(key);
  }

  has(contentType: string, key: string): boolean {
    const provider = this.providers.get(contentType);
    return provider !== undefined && provider.get(key) !== undefined;
  }

  listCatalog(): Array<{
    contentType: string;
    states: readonly SharedStateDescriptor[];
  }> {
    return [...this.typeCatalog.entries()]
      .map(([contentType, states]) => ({ contentType, states }))
      .sort((a, b) => a.contentType.localeCompare(b.contentType));
  }

  listProviders(): Array<{
    contentType: string;
    keys: readonly string[];
  }> {
    return [...this.providers.values()]
      .map((provider) => ({
        contentType: provider.contentType,
        keys: provider.keys(),
      }))
      .sort((a, b) => a.contentType.localeCompare(b.contentType));
  }

  listWatches(): Array<{
    id: string;
    listenerContentType: string;
    target: StateWatchTarget;
  }> {
    return [...this.watches.entries()]
      .map(([id, { descriptor }]) => ({
        id,
        listenerContentType: descriptor.listenerContentType,
        target: descriptor.target,
      }))
      .sort((a, b) =>
        a.listenerContentType.localeCompare(b.listenerContentType),
      );
  }

  watch(
    listenerContentType: string,
    target: StateWatchTarget,
    listener: () => void,
  ): () => void {
    const id = `watch-${this.nextWatchId++}`;
    const descriptor: StateWatchDescriptor = {
      listenerContentType,
      target,
    };

    this.watches.set(id, { listener, descriptor });
    this.recordLog({
      type: "watch",
      listenerContentType,
      target,
      at: Date.now(),
    });
    this.notifyPoolWatches();

    return () => {
      if (!this.watches.delete(id)) {
        return;
      }

      this.recordLog({
        type: "unwatch",
        listenerContentType,
        target,
        at: Date.now(),
      });
      this.notifyPoolWatches();
    };
  }

  watchPanel(
    panel: Panel,
    target: StateWatchTarget,
    listener: () => void,
  ): () => void {
    return this.watch(panel.contentType, target, listener);
  }

  subscribeLog(listener: StatePoolLogListener): () => void {
    for (const entry of this.log) {
      listener(entry);
    }

    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private recordLog(entry: StatePoolLogEvent): void {
    this.log.push(entry);

    if (this.log.length > MAX_LOG_ENTRIES) {
      this.log.shift();
    }

    for (const logListener of this.logListeners) {
      logListener(entry);
    }
  }

  private notifyMatchingWatches(event: StatePoolEvent): void {
    const trigger = this.triggerFromPoolEvent(event);

    for (const { listener, descriptor } of this.watches.values()) {
      if (descriptor.target.kind === "pool") {
        listener();
        this.recordReact(descriptor.listenerContentType, trigger);
        continue;
      }

      if (this.matchesStateWatch(descriptor.target, event)) {
        listener();
        this.recordReact(descriptor.listenerContentType, trigger);
      }
    }
  }

  private notifyPoolWatches(): void {
    for (const { listener, descriptor } of this.watches.values()) {
      if (descriptor.target.kind === "pool") {
        listener();
        this.recordReact(descriptor.listenerContentType, { kind: "pool" });
      }
    }
  }

  private triggerFromPoolEvent(event: StatePoolEvent): StatePoolReactTrigger {
    const eventLabel =
      event.type === "register"
        ? "provide"
        : event.type === "unregister"
          ? "withdraw"
          : "change";

    return {
      kind: "state",
      event: eventLabel,
      contentType: event.contentType,
      key: event.key,
    };
  }

  private recordReact(
    listenerContentType: string,
    trigger: StatePoolReactTrigger,
  ): void {
    this.recordLog({
      type: "react",
      listenerContentType,
      trigger,
      at: Date.now(),
    });
  }

  private matchesStateWatch(
    target: Extract<StateWatchTarget, { kind: "state" }>,
    event: StatePoolEvent,
  ): boolean {
    if (event.contentType !== target.contentType) {
      return false;
    }

    if (event.type === "change" || event.type === "register" || event.type === "unregister") {
      return event.key === target.key;
    }

    return false;
  }
}

export type ExposeState = (
  pool: StatePool,
  panel: Panel,
) => (() => void) | void;
