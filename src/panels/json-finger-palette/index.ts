import { JsonFingerPaletteContentType } from "./JsonFingerPalettePanel.js";
import type { PanelDefinition } from "../types.js";

export const jsonFingerPalettePanel: PanelDefinition = {
  type: "json-finger-palette",
  label: "Json Finger Palette",
  contentType: new JsonFingerPaletteContentType(),
};
