import { JsonShaperContentType } from "./JsonShaperPanel.js";
import type { PanelDefinition } from "../types.js";

export const jsonShaperPanel: PanelDefinition = {
  type: "json-shaper",
  label: "Json Shaper",
  contentType: new JsonShaperContentType(),
};
