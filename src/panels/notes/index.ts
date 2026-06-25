import { defineContentType } from "../defineContentType.js";
import type { PanelDefinition } from "../types.js";

export const notesPanel: PanelDefinition = {
  type: "notes",
  label: "Notes",
  contentType: defineContentType("Notes", (el, panel) => {
    el.className = "h-full w-full flex flex-col bg-amber-950/30";
    el.innerHTML = `
      <div class="flex-1 overflow-auto p-4 text-amber-50/90 text-sm outline-none" contenteditable="true">${panel.title}: jot ideas here...</div>
    `;
  }),
};
