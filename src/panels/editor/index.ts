import { EditorContentType } from "./EditorPanel.js";
import type { PanelDefinition } from "../types.js";

export const editorPanel: PanelDefinition = {
  type: "editor",
  label: "Editor",
  contentType: new EditorContentType(),
};
