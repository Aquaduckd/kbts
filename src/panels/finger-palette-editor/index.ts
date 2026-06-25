import { FingerPaletteEditorContentType } from "./FingerPaletteEditorPanel.js";
import type { PanelDefinition } from "../types.js";

export const fingerPaletteEditorPanel: PanelDefinition = {
  type: "finger-palette-editor",
  label: "Finger Palette Editor",
  contentType: new FingerPaletteEditorContentType(),
  sharedState: [
    { key: "palette", label: "Finger/hand colors for Keyboard Shaper" },
    { key: "name", label: "Palette name" },
  ],
};
