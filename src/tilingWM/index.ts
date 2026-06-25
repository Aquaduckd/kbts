export { Rect } from "./geometry/Rect.js";
export { LayoutMap } from "./geometry/LayoutMap.js";
export { LayoutEngine } from "./geometry/LayoutEngine.js";

export { LayoutNode } from "./model/LayoutNode.js";
export { Panel } from "./model/Panel.js";
export { Split, clampRatio, type SplitDirection } from "./model/Split.js";
export { LayoutTree } from "./model/LayoutTree.js";
export { PanelRegistry } from "./model/PanelRegistry.js";
export { createId, resetIds } from "./model/id.js";

export {
  ContentInstance,
  ContentType,
} from "./content/ContentType.js";
export { ContentRegistry } from "./content/ContentRegistry.js";
export { ContentHost } from "./content/ContentHost.js";

export {
  StatePool,
  createStateProvider,
  formatStatePoolLogEvent,
  formatReactTrigger,
  formatWatchTarget,
  type SharedStateDescriptor,
  type StateProvider,
  type StatePoolLogEvent,
  type StatePoolLogListener,
  type StatePoolReactTrigger,
  type StateWatchDescriptor,
  type StateWatchTarget,
  type ExposeState,
} from "./state/StatePool.js";

export { PanelShell, type PanelShellOptions } from "./view/PanelShell.js";
export { GutterView, type GutterViewOptions } from "./view/GutterView.js";
export { WorkspaceView, type WorkspaceViewOptions } from "./view/WorkspaceView.js";
export {
  PanelTypePicker,
  type PanelTypePickerLayout,
  type PanelTypePickerOptions,
  type PanelTypeFolder,
} from "./view/PanelTypePicker.js";
export {
  HiddenWorkspacesBar,
  type HiddenWorkspacesBarOptions,
} from "./view/HiddenWorkspacesBar.js";

export { FocusManager, type FocusDirection } from "./controllers/FocusManager.js";
export { DragController } from "./controllers/DragController.js";
export { ShortcutController } from "./controllers/ShortcutController.js";
export { isEditableTarget } from "./input/textInput.js";
export { resizeFocusedPanel } from "./controllers/PanelResize.js";
export {
  DEFAULT_SHORTCUTS,
  SHORTCUT_STORAGE_KEY,
  SHORTCUT_ACTION_LABELS,
  SHORTCUT_ACTION_ORDER,
  getShortcutConfig,
  loadShortcutConfig,
  saveShortcutConfig,
  resetShortcutConfig,
  resetShortcutBinding,
  updateShortcutBinding,
  matchesShortcut,
  findMatchingAction,
  findConflictingAction,
  formatShortcutBinding,
  bindingFromKeyboardEvent,
  bindingsEqual,
  setShortcutCaptureActive,
  isShortcutCaptureActive,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutConfig,
} from "./shortcuts/ShortcutConfig.js";
export {
  WindowManager,
  type WindowManagerOptions,
  type LayoutChangeListener,
  type PanelTypeOption,
} from "./controllers/WindowManager.js";
