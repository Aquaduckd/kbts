import { PongContentType } from "./PongPanel.js";
import type { PanelDefinition } from "../types.js";

export const pongPanel: PanelDefinition = {
  type: "pong",
  label: "Pong",
  contentType: new PongContentType(),
};
