import { RegistryPoolDebugContentType } from "./RegistryPoolDebugPanel.js";
import type { PanelDefinition } from "../types.js";

export const registryPoolDebugPanel: PanelDefinition = {
  type: "registry-pool-debug",
  label: "State Pool Debug",
  contentType: new RegistryPoolDebugContentType(),
};
