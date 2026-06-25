import { LavaLampContentType } from "./LavaLampPanel.js";
import type { PanelDefinition } from "../types.js";

export const lavaLampPanel: PanelDefinition = {
  type: "lava-lamp",
  label: "Lava Lamp",
  contentType: new LavaLampContentType(),
};
