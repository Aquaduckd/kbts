import type { ContentRegistry, StatePool } from "../tilingWM/index.js";
import { blankPanel } from "./blank/index.js";
import { corpusPanel } from "./corpus/index.js";
import { editorPanel } from "./editor/index.js";
import { fingerPaletteEditorPanel } from "./finger-palette-editor/index.js";
import { jsonFingerPalettePanel } from "./json-finger-palette/index.js";
import { jsonLayoutPanel } from "./json-layout/index.js";
import { jsonShaperPanel } from "./json-shaper/index.js";
import { layoutEditorPanel } from "./layout-editor/index.js";
import { keyboardShaperPanel } from "./keyboard-shaper/index.js";
import { keyboardShaperDebugPanel } from "./keyboard-shaper-debug/index.js";
import { lavaLampPanel } from "./lava-lamp/index.js";
import { registryPoolDebugPanel } from "./registry-pool-debug/index.js";
import { registryLoggerPanel } from "./registry-logger/index.js";
import { notesPanel } from "./notes/index.js";
import { pongPanel } from "./pong/index.js";
import { towersOfHanoiPanel } from "./towers-of-hanoi/index.js";
import { previewPanel } from "./preview/index.js";
import { shortcutsPanel } from "./shortcuts/index.js";
import { synthPanel } from "./synth/index.js";
import { terminalPanel } from "./terminal/index.js";
import { toPanelTypeOption, type PanelDefinition } from "./types.js";
import type { PanelTypePickerLayout } from "../tilingWM/index.js";

export const panels: PanelDefinition[] = [
  blankPanel,
  editorPanel,
  previewPanel,
  terminalPanel,
  notesPanel,
  keyboardShaperPanel,
  layoutEditorPanel,
  corpusPanel,
  fingerPaletteEditorPanel,
  keyboardShaperDebugPanel,
  jsonShaperPanel,
  jsonLayoutPanel,
  jsonFingerPalettePanel,
  registryPoolDebugPanel,
  registryLoggerPanel,
  shortcutsPanel,
  pongPanel,
  towersOfHanoiPanel,
  synthPanel,
  lavaLampPanel,
];

export const ephemeralPanelTypes = panels
  .filter((panel) => panel.ephemeral)
  .map((panel) => panel.type);

export const panelTypePickerLayout: PanelTypePickerLayout = {
  root: [keyboardShaperPanel, layoutEditorPanel, corpusPanel, fingerPaletteEditorPanel, shortcutsPanel].map(toPanelTypeOption),
  folders: [
    {
      label: "Json",
      types: [
        jsonShaperPanel,
        jsonLayoutPanel,
        jsonFingerPalettePanel,
      ].map(toPanelTypeOption),
    },
    {
      label: "Debug",
      types: [
        keyboardShaperDebugPanel,
        registryPoolDebugPanel,
        registryLoggerPanel,
      ].map(toPanelTypeOption),
    },
    {
      label: "Demos",
      types: [
        editorPanel,
        previewPanel,
        terminalPanel,
        notesPanel,
        synthPanel,
        lavaLampPanel,
      ].map(toPanelTypeOption),
    },
    {
      label: "Games",
      types: [pongPanel, towersOfHanoiPanel].map(toPanelTypeOption),
    },
  ],
};

export const panelTypes = [
  ...panelTypePickerLayout.root,
  ...panelTypePickerLayout.folders.flatMap((folder) => folder.types),
];

export function registerPanels(
  registry: ContentRegistry,
  statePool?: StatePool,
): ContentRegistry {
  for (const panel of panels) {
    registry.register(panel.type, panel.contentType);

    if (statePool && panel.sharedState) {
      statePool.registerTypeCatalog(panel.type, panel.sharedState);
    }
  }

  return registry;
}

export { blankPanel } from "./blank/index.js";
export { editorPanel } from "./editor/index.js";
export { fingerPaletteEditorPanel } from "./finger-palette-editor/index.js";
export { previewPanel } from "./preview/index.js";
export { terminalPanel } from "./terminal/index.js";
export { notesPanel } from "./notes/index.js";
export { pongPanel } from "./pong/index.js";
export { towersOfHanoiPanel } from "./towers-of-hanoi/index.js";
export { keyboardShaperPanel } from "./keyboard-shaper/index.js";
export { layoutEditorPanel } from "./layout-editor/index.js";
export { corpusPanel } from "./corpus/index.js";
export { keyboardShaperDebugPanel } from "./keyboard-shaper-debug/index.js";
export { lavaLampPanel } from "./lava-lamp/index.js";
export { jsonFingerPalettePanel } from "./json-finger-palette/index.js";
export { jsonShaperPanel } from "./json-shaper/index.js";
export { jsonLayoutPanel } from "./json-layout/index.js";
export { registryPoolDebugPanel } from "./registry-pool-debug/index.js";
export { registryLoggerPanel } from "./registry-logger/index.js";
export { shortcutsPanel } from "./shortcuts/index.js";
export { synthPanel } from "./synth/index.js";
export type { PanelDefinition } from "./types.js";
