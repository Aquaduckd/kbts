import { ShortcutsPanelContentType } from "./ShortcutsPanel.js";
import type { PanelDefinition } from "../types.js";

export const shortcutsPanel: PanelDefinition = {
  type: "shortcuts",
  label: "Shortcuts",
  contentType: new ShortcutsPanelContentType(),
};
