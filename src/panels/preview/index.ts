import { defineContentType } from "../defineContentType.js";
import type { PanelDefinition } from "../types.js";

export const previewPanel: PanelDefinition = {
  type: "preview",
  label: "Preview",
  contentType: defineContentType("Preview", (el, panel) => {
    el.className = "h-full w-full flex flex-col bg-white text-slate-900";
    el.innerHTML = `
      <article class="flex-1 overflow-auto p-6">
        <h1 class="text-xl font-semibold">${panel.title}</h1>
        <p class="mt-2 text-slate-600">Preview output would render here.</p>
      </article>
    `;
  }),
};
