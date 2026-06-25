import { RegistryLoggerContentType } from "./RegistryLoggerPanel.js";
import type { PanelDefinition } from "../types.js";

export const registryLoggerPanel: PanelDefinition = {
  type: "registry-logger",
  label: "State Pool Log",
  contentType: new RegistryLoggerContentType(),
};
