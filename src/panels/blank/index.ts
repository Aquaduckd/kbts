import { defineContentType } from "../defineContentType.js";
import type { PanelDefinition } from "../types.js";

export const blankPanel: PanelDefinition = {
  type: "blank",
  label: "Blank",
  ephemeral: true,
  contentType: defineContentType("Blank", (el) => {
    el.className = "h-full w-full p-4 text-slate-400 text-sm";
    el.textContent =
      "Click the title to choose a panel type, or use H/V to split.";
  }),
};
