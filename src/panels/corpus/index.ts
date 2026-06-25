import { CorpusPanelContentType } from "./CorpusPanel.js";
import type { PanelDefinition } from "../types.js";

export const corpusPanel: PanelDefinition = {
  type: "corpus",
  label: "Corpus",
  contentType: new CorpusPanelContentType(),
  sharedState: [
    { key: "name", label: "Corpus name" },
    { key: "text", label: "Corpus text" },
  ],
};
