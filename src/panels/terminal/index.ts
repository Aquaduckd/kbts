import { defineContentType } from "../defineContentType.js";
import type { PanelDefinition } from "../types.js";

export const terminalPanel: PanelDefinition = {
  type: "terminal",
  label: "Terminal",
  contentType: defineContentType("Terminal", (el, panel) => {
    el.className =
      "h-full w-full bg-black p-4 font-mono text-sm text-green-400 overflow-auto";
    el.innerHTML = `
      <p class="text-xs text-slate-600 mb-2">${panel.title}</p>
      <p><span class="text-slate-500">$</span> kbts init</p>
      <p class="text-slate-300">tiling workspace ready</p>
      <p class="mt-2"><span class="text-slate-500">$</span> <span class="animate-pulse">_</span></p>
    `;
  }),
};
