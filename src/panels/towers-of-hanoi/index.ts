import { TowersOfHanoiContentType } from "./TowersOfHanoiPanel.js";
import type { PanelDefinition } from "../types.js";

export const towersOfHanoiPanel: PanelDefinition = {
  type: "towers-of-hanoi",
  label: "Towers of Hanoi",
  contentType: new TowersOfHanoiContentType(),
};
