import { LayoutEditorContentType } from "./LayoutEditorPanel.js";
import type { PanelDefinition } from "../types.js";

export const layoutEditorPanel: PanelDefinition = {
  type: "layout-editor",
  label: "Layout Editor",
  contentType: new LayoutEditorContentType(),
  sharedState: [
    { key: "name", label: "Layout name" },
    { key: "keyboard", label: "Resolved keyboard shape for downstream panels" },
    { key: "characters", label: "Keyboard character map for downstream panels" },
    { key: "shape", label: "Keyboard shape source and summary" },
  ],
};
