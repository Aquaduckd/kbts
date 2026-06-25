import { KeyboardShaperDebugContentType } from "./KeyboardShaperDebugPanel.js";
import type { PanelDefinition } from "../types.js";

export const keyboardShaperDebugPanel: PanelDefinition = {
  type: "keyboard-shaper-debug",
  label: "Keyboard Shaper Debug",
  contentType: new KeyboardShaperDebugContentType(),
};
