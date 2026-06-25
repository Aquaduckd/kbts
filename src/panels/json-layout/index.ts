import { JsonLayoutContentType } from "./JsonLayoutPanel.js";
import type { PanelDefinition } from "../types.js";

export const jsonLayoutPanel: PanelDefinition = {
  type: "json-layout",
  label: "Json Layout",
  contentType: new JsonLayoutContentType(),
};
