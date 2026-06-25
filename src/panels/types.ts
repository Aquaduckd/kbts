import type { ContentType, SharedStateDescriptor } from "../tilingWM/index.js";
import type { PanelTypeOption } from "../tilingWM/index.js";

export interface PanelDefinition {
  type: string;
  label: string;
  contentType: ContentType;
  /** Keys this panel exposes via the shared state pool. */
  sharedState?: readonly SharedStateDescriptor[];
  /** Destroyed on close; omitted from the type picker. */
  ephemeral?: boolean;
}

export function toPanelTypeOption({ type, label }: PanelDefinition): PanelTypeOption {
  return { type, label };
}
