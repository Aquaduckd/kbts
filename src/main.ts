import { ContentRegistry, StatePool, WindowManager } from "./tilingWM/index.js";
import { panelTypePickerLayout, registerPanels } from "./panels/index.js";

const statePool = new StatePool();
const registry = registerPanels(new ContentRegistry(), statePool);

const app = document.querySelector<HTMLDivElement>("#app")!;
app.className = "h-screen w-screen bg-slate-950 text-slate-100";

export const wm = new WindowManager(app, {
  registry,
  statePool,
  panelPickerLayout: panelTypePickerLayout,
  initialContentType: "blank",
  initialTitle: "Blank",
});

export { statePool };
