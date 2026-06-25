import { KeyboardShaperContentType } from "./KeyboardShaperPanel.js";
import type { PanelDefinition } from "../types.js";

export const keyboardShaperPanel: PanelDefinition = {
  type: "keyboard-shaper",
  label: "Keyboard Shaper",
  contentType: new KeyboardShaperContentType(),
  sharedState: [
    { key: "keyboard", label: "Keyboard shape for Layout Editor" },
    { key: "summary", label: "Keyboard layout summary for debug panels" },
  ],
};
