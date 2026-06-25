import { SynthPanelContentType } from "./SynthPanel.js";
import type { PanelDefinition } from "../types.js";

export const synthPanel: PanelDefinition = {
  type: "synth",
  label: "Synth",
  contentType: new SynthPanelContentType(),
};
