import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  BringToFront,
  CheckSquare,
  ChevronDown,
  Clipboard,
  Italic,
  PanelBottom,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  MousePointer2,
  PanelRight,
  PanelTop,
  Play,
  Plus,
  Save,
  Search,
  SendToBack,
  Settings,
  Square,
  StickyNote,
  Type,
  Underline,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri, openProjectFile, readLastProjectPath, saveProjectFile, syncEditMenuState, syncRecentProjects, writeLastProjectPath } from "./lib/mockupsApi";
import type { CanvasLink, CanvasNode, ComponentDefinition, ComponentKind, MockupProject, Wireframe } from "./types";

const leftPaneCollapsedKey = "moqira-left-pane-collapsed";
const rightPaneCollapsedKey = "moqira-right-pane-collapsed";
const projectPathKey = "moqira-last-project-path";
const themeKey = "moqira-theme";
const accentKey = "moqira-accent";
const appFontSizeKey = "moqira-app-font-size";
const appFontFamilyKey = "moqira-app-font-family";
const accentTitlebarKey = "moqira-accent-titlebar";
const recentProjectsKey = "moqira-recent-projects";
const legacyProjectPathKey = "mockups-last-project-path";
const legacyThemeKey = "mockups-theme";
const legacyAccentKey = "mockups-accent";
const legacyAppFontSizeKey = "mockups-app-font-size";
const legacyAppFontFamilyKey = "mockups-app-font-family";
const legacyAccentTitlebarKey = "mockups-accent-titlebar";
const legacyRecentProjectsKey = "mockups-recent-projects";
const maxRecentProjects = 8;
const maxProjectHistoryEntries = 100;

function wireframeBackground(wireframe: Wireframe | undefined) {
  return wireframe?.background ?? "white";
}

function wireframeShowGrid(wireframe: Wireframe | undefined) {
  return wireframe?.showGrid ?? true;
}

const lucideIconNames: string[] = Object.keys(LucideIcons)
  .filter((name) => /^[A-Z]/.test(name) && !name.endsWith("Icon") && !name.endsWith("LucideIcon"))
  .filter((name) => {
    const value = (LucideIcons as Record<string, unknown>)[name];
    return typeof value === "object" && value !== null && "$$typeof" in (value as object);
  })
  .sort();

function getLucideIcon(name: string | undefined): LucideIcon {
  if (name) {
    const candidate = (LucideIcons as Record<string, unknown>)[name];
    if (typeof candidate === "object" && candidate !== null && "$$typeof" in (candidate as object)) {
      return candidate as LucideIcon;
    }
  }
  return Plus;
}

const iconMap: Record<string, LucideIcon> = {
  rectangle: Square,
  button: MousePointer2,
  tabs: Layers,
  buttonBar: AlignLeft,
  checkbox: CheckSquare,
  checkboxList: Clipboard,
  icon: PanelRight,
  dropdown: ChevronDown,
  textbox: Type,
  text: Type,
  stickyNote: StickyNote,
};

const componentCategories = ["All", "Common", "Text", "Forms", "Containers", "Data", "Charts", "Navigation", "Markup", "Media", "iOS"] as const;
type ComponentCategory = (typeof componentCategories)[number];

function componentIcon(name: string): LucideIcon {
  return iconMap[name] ?? getLucideIcon(name);
}

function component(
  kind: ComponentKind,
  label: string,
  category: Exclude<ComponentCategory, "All"> | Exclude<ComponentCategory, "All">[],
  icon: string,
  width: number,
  height: number,
  defaults: Partial<CanvasNode> = {},
): ComponentDefinition {
  return { kind, label, category, icon, width, height, defaults };
}

function componentCategoryNames(definition: ComponentDefinition) {
  if (!definition.category) return [];
  return Array.isArray(definition.category) ? definition.category : [definition.category];
}

const componentLibrary: ComponentDefinition[] = [
  component("rectangle", "Rectangle", ["Common", "Containers"], "rectangle", 180, 110, { fill: "#ffffff", stroke: "#1f2937" }),
  component("button", "Button", ["Common", "Forms"], "button", 112, 40, { text: "Button", fill: "#ffffff" }),
  component("circleButton", "Circle Button", ["Common", "Forms"], "CirclePlus", 72, 72, { text: "+", fill: "#ffffff", fontSize: 30 }),
  component("pointyButton", "Pointy Button", "Forms", "ChevronLeft", 150, 44, { text: "Button", fill: "#ffffff", variant: "left" }),
  component("multilineButton", "Multiline Button", "Forms", "MousePointer2", 170, 54, { text: "Multiline Button\nSecond line of text", fill: "#ffffff" }),
  component("helpButton", "Help Button", "Forms", "CircleHelp", 60, 60, { text: "?", fill: "#ffffff", fontSize: 30 }),
  component("icon", "Icon", ["Common", "Media"], "icon", 64, 64, { icon: "Plus", textColor: "#111827" }),
  component("iconText", "Icon and Text", ["Common", "Media"], "BadgeInfo", 110, 90, { icon: "Square", text: "Icon Name", textColor: "#111827" }),
  component("stickyNote", "Comment", "Markup", "stickyNote", 180, 160, { text: "A comment", fill: "#fff2a8", fontSize: 16 }),

  component("textLabel", "Text Label", ["Common", "Text"], "Type", 180, 34, { text: "Some text", fontSize: 18 }),
  component("textTitle", "Text Title", "Text", "Heading1", 240, 48, { text: "A Big Title", fontSize: 28 }),
  component("textSubtitle", "Text Subtitle", "Text", "Heading2", 220, 42, { text: "A Subtitle", fontSize: 22 }),
  component("textParagraph", "Text Paragraph", ["Common", "Text"], "Pilcrow", 275, 80, {
    text: "A **paragraph** of {color:red}text{color} with an [unassigned link].\nA *second* <u>row</u> of ~~text~~ with a [web link]\nAn icon :circle-plus-solid: inline with text.",
    fontSize: 13,
  }),
  component("link", "Link", ["Common", "Text"], "Link", 120, 34, { text: "a link", textColor: "#2563eb", fontSize: 24 }),
  component("squigglyParagraph", "Squiggly Paragraph", ["Common", "Text"], "AlignLeft", 250, 86, { text: "A paragraph of text.\nA second row of text." }),

  component("checkbox", "Checkbox", ["Common", "Forms"], "checkbox", 150, 32, { text: "Checkbox", checked: false }),
  component("checkboxList", "Checkbox List", ["Common", "Forms"], "checkboxList", 230, 168, {
    options: [
      "[ ] not selected",
      "[x] selected",
      "[-] indeterminate",
      "-[ ] disabled-",
      "-[x] disabled selected-",
      "-[-] disabled indeterminate-",
      "A row without a checkbox",
    ],
    text: "Checkbox List",
  }),
  component("radioButton", "Radio Button", ["Common", "Forms"], "CircleDot", 160, 32, { text: "Radio Button", checked: false }),
  component("radioButtonGroup", "Radio Button Group", ["Common", "Forms"], "ListChecks", 210, 126, { options: ["option 1", "option 2", "option 3"], text: "Radio Group" }),
  component("dropdown", "Dropdown", "Forms", "dropdown", 180, 40, { text: "Choose...", options: ["First", "Second", "Third"] }),
  component("comboBox", "ComboBox", ["Common", "Forms"], "ChevronDownSquare", 180, 40, { text: "ComboBox", options: ["First", "Second", "Third"] }),
  component("textbox", "Textbox", "Forms", "textbox", 190, 40, { text: "Text input" }),
  component("textInput", "Text Input", ["Common", "Forms"], "TextCursorInput", 190, 40, { text: "", placeholder: "Text input" }),
  component("textArea", "Text Area", ["Common", "Forms"], "Text", 230, 120, { text: "Text area" }),
  component("searchBox", "Search Box", "Forms", "Search", 190, 36, { text: "", placeholder: "search" }),
  component("searchBoxVoice", "Search Box + Mic", "Forms", "Mic", 210, 36, { text: "", placeholder: "search" }),
  component("colorPicker", "Color Picker", "Forms", "Palette", 76, 76, { fill: "#2563eb" }),
  component("numericStepper", "Num. Stepper", "Forms", "PanelTopOpen", 96, 58, { value: 3 }),
  component("onOffSwitch", "ON/OFF Switch", "Forms", "ToggleRight", 108, 56, { checked: true, fill: "#6cc24a" }),
  component("progressBar", "Progress Bar", "Forms", "BatteryMedium", 170, 28, { value: 45 }),
  component("progressBarIndeterminate", "Progress (Ind.)", "Forms", "MoreHorizontal", 170, 28, { variant: "indeterminate" }),

  component("tabs", "Tabs", "Navigation", "tabs", 260, 100, {
    options: ["One", "Two", "Three", "Four"],
    activeIndex: -1,
    showBorder: true,
    showScrollbar: false,
    tabPlacement: "top",
    tabAlignment: "left",
  }),
  component("buttonBar", "Button Bar", "Navigation", "buttonBar", 240, 40, { options: ["One", "Two", "Three"], activeIndex: 0 }),
  component("vTabs", "V.Tabs", "Navigation", "PanelLeft", 150, 160, { options: ["First Tab", "Second Tab", "Third Tab", "Fourth Tab"], activeIndex: 1 }),
  component("linkBar", "Link Bar", "Navigation", "Link", 250, 38, { options: ["Home", "Products", "Company", "Blog"] }),
  component("breadcrumbs", "Breadcrumbs", "Navigation", "ChevronRight", 240, 34, { options: ["Home", "Products", "Bags", "Feature"] }),
  component("menuBar", "Menu Bar", ["Common", "Navigation"], "Menu", 250, 34, { options: ["File", "Edit", "View", "Help"] }),
  component("menu", "Menu", "Navigation", "PanelTopClose", 120, 142, { options: ["Open", "Open Recent", "Close", "Save", "Toggle Item"] }),
  component("appBar", "App Bar", "Navigation", "PanelTop", 180, 32, { text: "Heading" }),
  component("playback", "Playback", "Navigation", "CirclePlay", 120, 40, { options: ["rew", "play", "ff"] }),
  component("toolbar", "Toolbar", "Navigation", "Rows3", 230, 32, { options: ["B", "I", "U", "link", "align"] }),

  component("accordion", "Accordion", "Containers", "PanelTop", 150, 186, {
    options: ["Item 1", "Item 2", "- Sub-Item 2.1", "- Sub-Item 2.2", "Item 3"],
    activeIndex: 0,
    showScrollbar: false,
  }),
  component("alertBox", "Alert Box", "Containers", "MessageSquareWarning", 240, 140, {
    text: "Alert\nAlert text goes here",
    options: ["No", "Yes"],
    showBorder: true,
    textAlign: "center",
  }),
  component("alertBoxAndroid", "Alert Box (Android)", "Containers", "MessageSquareWarning", 260, 145, {
    text: "Alert\nAlert text goes here",
    options: ["No", "Yes"],
    showBorder: true,
    textAlign: "left",
  }),
  component("browser", "Browser", ["Common", "Containers"], "PanelTop", 220, 160, { text: "http://example.com" }),
  component("window", "Window", ["Common", "Containers"], "PanelTop", 220, 160, { text: "Window Title" }),
  component("modalScreen", "Modal Screen", "Containers", "PanelTop", 220, 140, { fill: "#777777" }),
  component("fieldSet", "Field Set", "Containers", "SquareDashed", 220, 170, { text: "Group Name", fill: "#ffffff" }),
  component("popover", "Popover", "Containers", "MessageSquare", 160, 105, { text: "Popover", fill: "#ffffff" }),
  component("tooltip", "Tooltip", "Containers", "MessageCircle", 165, 74, { text: "a tooltip", fill: "#ffffff" }),
  component("callout", "Callout", "Containers", "CircleAlert", 86, 86, { text: "1", fill: "#fff300", fontSize: 28 }),

  component("list", "List", "Data", "List", 140, 130, { options: ["Item One", "Item Two", "Item Three"] }),
  component("listIcon", "List with Icons", "Data", "ListChecks", 170, 130, { options: ["Item One", "Item Two", "Item Three"] }),
  component("treePane", "TreeView Pane", "Data", "FolderTree", 300, 285, {
    options: [
      "f Use f for closed folders",
      "F Use F for open folders",
      "[+] You may also use this",
      "[-] and this",
      "[x] or this",
      "[ ] and this",
      "> or even this",
      "v and this",
      "- Use - for a file icon",
      "_ or _ to leave a space for your own icon",
      "F use spaces or dots for hierarchy",
      " v just like",
      "..- this",
    ],
  }),
  component("dataGrid", "Data Grid", "Data", "Table", 340, 340, {
    text: [
      "Name\\r(job title) ^, Age ^v, Nickname, Employee v",
      "Giacomo Guilizzoni\\rFounder & CEO, 40, Peldi, (o)",
      "Marco Botton\\rTuttofare, 38, , [x]",
      "Mariah Maclachlan\\rBetter Half, 41, Patata, [-]",
      "Valerie Liberty\\rHead Chef, :), Val, [x]",
      "[Data Grid Docs     ](https://balsamiq.com/wireframes/desktop/docs/datagrids/), , , [ ]",
      "{65L, 0R, 35, 0C}",
    ].join("\n"),
  }),
  component("calendar", "Calendar", "Data", "CalendarDays", 130, 130, { text: "MAY 2026" }),
  component("dateChooser", "Date Chooser", "Data", "CalendarPlus", 128, 42, { text: " / / " }),
  component("datePicker", "Date Picker", "Data", "Calendar", 135, 170, { text: "May 2026" }),
  component("timePicker", "Time Picker", "Data", "Clock3", 88, 120, { text: "4:14" }),
  component("siteMap", "Site Map", "Data", "Network", 210, 130, { options: ["Home", "About", "Products", "Contact"] }),
  component("streetMap", "Street Map", "Data", "Map", 160, 120, { fill: "#eef2e8" }),
  component("tagCloud", "Tag Cloud", "Data", "Tags", 250, 105, { text: "wireframe mockup UI design notes", fontSize: 14 }),

  component("chartBar", "Chart: Bar", "Charts", "BarChartHorizontal", 150, 105),
  component("chartColumn", "Chart: Column", "Charts", "BarChart3", 150, 105),
  component("chartLine", "Chart: Line", "Charts", "LineChart", 160, 105),
  component("chartPie", "Chart: Pie", "Charts", "PieChart", 110, 110),
  component("hScrollBar", "H.Scroll Bar", "Charts", "PanelBottom", 180, 28, { orientation: "horizontal" }),
  component("vScrollBar", "V.Scroll Bar", ["Common", "Charts"], "PanelRight", 28, 180, { orientation: "vertical" }),
  component("hSlider", "H.Slider", "Charts", "SlidersHorizontal", 170, 36, { orientation: "horizontal", value: 55 }),
  component("vSlider", "V.Slider", "Charts", "SlidersVertical", 36, 170, { orientation: "vertical", value: 55 }),
  component("volumeSlider", "Volume Slider", "Charts", "Volume2", 180, 46, { value: 55 }),

  component("arrow", "Arrow", "Markup", "MoveUpRight", 140, 80),
  component("hRule", "H.Rule", "Markup", "Minus", 150, 24, { orientation: "horizontal" }),
  component("vRule", "V.Rule", "Markup", "Minus", 24, 150, { orientation: "vertical" }),
  component("hSplitter", "H.Splitter", "Markup", "GripHorizontal", 180, 28),
  component("vSplitter", "V.Splitter", "Markup", "GripVertical", 28, 180),
  component("redX", "Red X", "Markup", "X", 140, 70, { stroke: "#8b111c" }),
  component("scratchOut", "Scratch-Out", "Markup", "Paintbrush", 140, 70),
  component("squigglyLine", "Squiggly Line", ["Common", "Markup"], "Waves", 160, 35),
  component("hCurlyBrace", "H.Curly Brace", "Markup", "Braces", 180, 46, { text: "A paragraph of text.\nA second row of text." }),
  component("vCurlyBrace", "V.Curly Brace", "Markup", "Braces", 56, 160, { text: "A paragraph of text.\nA second row of text." }),
  component("shape", "Shape", ["Common", "Markup"], "Circle", 95, 95, { fill: "#ffffff" }),

  component("image", "Image", ["Common", "Media"], "Image", 140, 120, { fill: "#ffffff" }),
  component("webcam", "Webcam", "Media", "Webcam", 130, 130),
  component("videoPlayer", "Video Player", "Media", "Clapperboard", 220, 145),
  component("coverFlow", "Cover Flow", "Media", "GalleryHorizontal", 200, 120),
  component("smartphone", "Smartphone", "Media", "Smartphone", 82, 160),
  component("iphone", "iPhone", "Media", "Smartphone", 82, 160),
  component("ipad", "iPad", "Media", "Tablet", 115, 170),

  component("iosKeyboard", "iOS Keyboard", "iOS", "Keyboard", 235, 110),
  component("iosMenu", "iOS Menu", "iOS", "List", 120, 170, { options: ["Label", "Label", "Label", "Label"] }),
  component("iosPicker", "iOS Picker", "iOS", "PanelBottom", 150, 130, { options: ["08", "09", "10", "AM", "PM"] }),
];

const commonComponentOrder: ComponentKind[] = [
  "browser",
  "button",
  "checkbox",
  "checkboxList",
  "circleButton",
  "comboBox",
  "icon",
  "iconText",
  "image",
  "link",
  "menuBar",
  "radioButton",
  "radioButtonGroup",
  "rectangle",
  "shape",
  "squigglyParagraph",
  "squigglyLine",
  "textArea",
  "textInput",
  "textLabel",
  "textParagraph",
  "vScrollBar",
  "window",
];

const commonComponentRank = new Map<ComponentKind, number>(
  commonComponentOrder.map((kind, index) => [kind, index]),
);

type ContextMenuState = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  targetId: string | null;
  stack: CanvasNode[];
};

type WireframeContextMenuState = {
  x: number;
  y: number;
  wireframeId: string | null;
};

type RenameWireframeState = {
  wireframeId: string;
  draft: string;
};

type DragState =
  | {
      kind: "move";
      nodeIds: string[];
      startX: number;
      startY: number;
      originalPositions: Record<string, { x: number; y: number }>;
      currentX: number;
      currentY: number;
    }
  | {
      kind: "resize";
      nodeId: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      originalX: number;
      originalY: number;
      originalWidth: number;
      originalHeight: number;
      currentX: number;
      currentY: number;
      currentWidth: number;
      currentHeight: number;
    };

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

type PaletteDragState = {
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type SelectionRectState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
  moved: boolean;
};

type InteractiveSelectState = {
  nodeId: string;
  open: boolean;
  selectedIndex: number | null;
};

type TextEditorState = {
  nodeId: string;
  field: "text" | "options";
  draft: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maxHeight: number;
  multiline: boolean;
};

type TextEditSnapshot = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

type RecentProject = {
  path: string;
  name: string;
  openedAt: number;
};

type ProjectHistory = {
  past: MockupProject[];
  present: MockupProject;
  future: MockupProject[];
};

type ProjectChangeOptions = {
  groupKey?: string;
};

type ClipboardImage = {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
};

type MenuActions = {
  newProject: () => void;
  newWireframe: () => void;
  openProject: () => void;
  saveProject: (saveAs?: boolean) => Promise<boolean>;
  undoProjectChange: () => void;
  redoProjectChange: () => void;
  cutNode: () => void;
  copyNode: () => void;
  pasteNode: (x?: number, y?: number) => void | Promise<void>;
  deleteNode: () => void;
  duplicateNode: () => void;
  selectNone: () => void;
  layerNode: (action: "front" | "back" | "forward" | "backward") => void;
  lockNode: () => void;
  unlockAllNodes: () => void;
  openSettings: () => void;
  openRecentProject: (path: string) => void;
};

function editableTextField(node: CanvasNode): "text" | "options" | null {
  const optionKinds: ComponentKind[] = [
    "accordion",
    "buttonBar",
    "checkboxList",
    "breadcrumbs",
    "linkBar",
    "list",
    "listIcon",
    "menu",
    "menuBar",
    "playback",
    "radioButtonGroup",
    "siteMap",
    "tabs",
    "tabBar",
    "toolbar",
    "treePane",
    "vTabs",
    "iosMenu",
    "iosPicker",
  ];
  if (optionKinds.includes(node.kind)) return "options";
  if (typeof node.text === "string") return "text";
  return null;
}

function isMultilineTextNode(node: CanvasNode, field: "text" | "options", draft: string) {
  if (field === "options" && usesCommaSeparatedOptions(node)) return false;
  if (field === "options") return true;
  if (["dataGrid", "stickyNote", "textArea", "textParagraph", "squigglyParagraph"].includes(node.kind)) return true;
  return draft.includes("\n");
}

function usesCommaSeparatedOptions(node: CanvasNode) {
  return ["alertBox", "alertBoxAndroid", "breadcrumbs", "buttonBar", "linkBar", "menuBar", "tabs", "tabBar"].includes(node.kind);
}

function optionsEditDraft(node: CanvasNode) {
  const options = node.options ?? [];
  return usesCommaSeparatedOptions(node) ? options.join(", ") : options.join("\n");
}

function parseOptionsEditDraft(node: CanvasNode, draft: string) {
  if (usesCommaSeparatedOptions(node)) return draft.split(",").map((item) => item.trim()).filter(Boolean);
  return draft.split("\n");
}

function isTabsNode(node: CanvasNode) {
  return node.kind === "tabs" || node.kind === "tabBar";
}

function displayNodeName(node: CanvasNode) {
  return isTabsNode(node) ? "Tabs" : node.name;
}

type TextInputElement = HTMLInputElement | HTMLTextAreaElement;

let lastTextInput: TextInputElement | null = null;
let lastTextInputSelection: { value: string; selectionStart: number; selectionEnd: number; floatingEditor: boolean; updatedAt: number } | null = null;

function isTextInputElement(element: Element | null): element is TextInputElement {
  if (element instanceof HTMLTextAreaElement) return true;
  return element instanceof HTMLInputElement && ["text", "search", "url", "tel", "email", "password", ""].includes(element.type);
}

function rememberTextInputSelection(element: TextInputElement) {
  lastTextInput = element;
  lastTextInputSelection = {
    value: element.value,
    selectionStart: element.selectionStart ?? 0,
    selectionEnd: element.selectionEnd ?? element.selectionStart ?? 0,
    floatingEditor: Boolean(element.closest(".floating-text-editor")),
    updatedAt: Date.now(),
  };
}

function activeTextInput() {
  const activeElement = document.activeElement;
  if (isTextInputElement(activeElement)) {
    rememberTextInputSelection(activeElement);
    return activeElement;
  }
  if (lastTextInput?.isConnected && lastTextInput.closest(".floating-text-editor")) return lastTextInput;
  return null;
}

function replaceSelectedText(element: TextInputElement, text: string, inputType: InputEvent["inputType"]) {
  const selectionStart = element.selectionStart ?? element.value.length;
  const selectionEnd = element.selectionEnd ?? selectionStart;
  element.setRangeText(text, selectionStart, selectionEnd, "end");
  element.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType }));
  rememberTextInputSelection(element);
}

function textInputSnapshot(element: TextInputElement): TextEditSnapshot {
  return {
    value: element.value,
    selectionStart: element.selectionStart ?? element.value.length,
    selectionEnd: element.selectionEnd ?? element.selectionStart ?? element.value.length,
  };
}

function replaceTextInputSelection(element: TextInputElement, text: string) {
  const selectionStart = element.selectionStart ?? element.value.length;
  const selectionEnd = element.selectionEnd ?? selectionStart;
  const nextValue = `${element.value.slice(0, selectionStart)}${text}${element.value.slice(selectionEnd)}`;
  return {
    value: nextValue,
    selectionStart: selectionStart + text.length,
    selectionEnd: selectionStart + text.length,
  };
}

function runEditableClipboardAction(action: "cut" | "copy" | "paste", allowCachedSelection = false) {
  const element = activeTextInput();
  if (!element && action !== "copy" && action !== "cut") return false;
  if (!element) {
    const canUseCachedSelection =
      allowCachedSelection &&
      lastTextInputSelection?.floatingEditor &&
      Date.now() - lastTextInputSelection.updatedAt < 5000;
    if (!canUseCachedSelection) return false;
    const selectedText = lastTextInputSelection
      ? lastTextInputSelection.value.slice(lastTextInputSelection.selectionStart, lastTextInputSelection.selectionEnd)
      : "";
    if (!selectedText) return false;
    void navigator.clipboard?.writeText(selectedText);
    return true;
  }
  const selectionStart = element.selectionStart ?? lastTextInputSelection?.selectionStart ?? 0;
  const selectionEnd = element.selectionEnd ?? lastTextInputSelection?.selectionEnd ?? selectionStart;
  if (document.activeElement !== element) {
    element.focus({ preventScroll: true });
    element.setSelectionRange(selectionStart, selectionEnd);
  }
  if (document.execCommand(action)) return true;
  if (action === "paste") {
    void navigator.clipboard?.readText().then((text) => replaceSelectedText(element, text, "insertFromPaste"));
    return true;
  }
  const selectedText = element.value.slice(selectionStart, selectionEnd);
  if (!selectedText) return true;
  void navigator.clipboard?.writeText(selectedText);
  if (action === "cut" && selectionStart !== selectionEnd) replaceSelectedText(element, "", "deleteByCut");
  return true;
}

function quickAccessScore(definition: ComponentDefinition, query: string) {
  const label = definition.label.toLowerCase();
  const kind = definition.kind.toLowerCase();
  const category = componentCategoryNames(definition).join(" ").toLowerCase();
  const haystack = `${label} ${category} ${kind}`;
  if (!haystack.includes(query)) return Number.POSITIVE_INFINITY;
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 2;
  if (kind === query || kind.startsWith(query)) return 3;
  if (componentCategoryNames(definition).some((item) => item.toLowerCase() === query)) return 4;
  return 5;
}

const FILENAME_SLASH = "／";
const FILENAME_LEADING_DOT = "．";
const FILENAME_HASH = "＃";
const FILENAME_PERCENT = "％";

function encodeTitleForFilename(title: string): string {
  return title
    .replace(/\//g, FILENAME_SLASH)
    .replace(/#/g, FILENAME_HASH)
    .replace(/%/g, FILENAME_PERCENT)
    .replace(/^\.+/, (dots) => FILENAME_LEADING_DOT.repeat(dots.length));
}

function decodeTitleFromFilename(name: string): string {
  return name.replace(/／/g, "/").replace(/．/g, ".").replace(/＃/g, "#").replace(/％/g, "%");
}

function readStoredValue(key: string, legacyKey: string) {
  const value = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
  if (value !== null && !localStorage.getItem(key)) localStorage.setItem(key, value);
  return value;
}

function readRecentProjects(): RecentProject[] {
  try {
    const raw = readStoredValue(recentProjectsKey, legacyRecentProjectsKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentProject[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.path && item.name) : [];
  } catch {
    return [];
  }
}

function writeRecentProjects(projects: RecentProject[]) {
  localStorage.setItem(recentProjectsKey, JSON.stringify(projects.slice(0, maxRecentProjects)));
}

function addRecentProject(projects: RecentProject[], path: string, name: string): RecentProject[] {
  const next = [{ path, name, openedAt: Date.now() }, ...projects.filter((project) => project.path !== path)];
  writeRecentProjects(next);
  return next.slice(0, maxRecentProjects);
}

function createId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function createDefaultProject(): MockupProject {
  const firstWireframeId = createId("wireframe");
  return {
    schemaVersion: 1,
    name: "New Project",
    activeWireframeId: firstWireframeId,
    appearance: {
      colorScheme: "system",
      accentColor: "#2563eb",
      appFontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      appFontSize: 14,
      accentTitlebar: false,
    },
    wireframes: [
      {
        id: firstWireframeId,
        name: "Wireframe 1",
        background: "white",
        showGrid: true,
        nodes: [],
      },
    ],
  };
}

function defaultAppearance(): MockupProject["appearance"] {
  return createDefaultProject().appearance;
}

function createNode(kind: ComponentKind, x: number, y: number): CanvasNode {
  const definition = componentLibrary.find((item) => item.kind === kind)!;
  return {
    id: createId("node"),
    kind,
    name: definition.label,
    x,
    y,
    width: definition.width,
    height: definition.height,
    stroke: "#111827",
    fill: "#ffffff",
    textColor: "#111827",
    fontSize: 14,
    ...definition.defaults,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read clipboard image."));
    reader.readAsDataURL(blob);
  });
}

function imageSizeFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 320, height: image.naturalHeight || 240 });
    image.onerror = () => resolve({ width: 320, height: 240 });
    image.src = dataUrl;
  });
}

async function readClipboardImage(): Promise<ClipboardImage | null> {
  try {
    if (!navigator.clipboard?.read) return null;
    const clipboardItems = await navigator.clipboard.read();
    for (const item of clipboardItems) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      const dataUrl = await blobToDataUrl(blob);
      const size = await imageSizeFromDataUrl(dataUrl);
      return { dataUrl, mimeType: imageType, ...size };
    }
  } catch {
    return null;
  }
  return null;
}

function imageBlobFromDataTransfer(dataTransfer: DataTransfer | null): { blob: Blob; mimeType: string } | null {
  if (!dataTransfer) return null;
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return { blob: file, mimeType: item.type };
  }
  for (const file of Array.from(dataTransfer.files)) {
    if (file.type.startsWith("image/")) return { blob: file, mimeType: file.type };
  }
  return null;
}

async function clipboardImageFromBlob(blob: Blob, mimeType: string): Promise<ClipboardImage> {
  const dataUrl = await blobToDataUrl(blob);
  const size = await imageSizeFromDataUrl(dataUrl);
  return { dataUrl, mimeType, ...size };
}

function imageNodeDisplaySize(image: Pick<ClipboardImage, "width" | "height">) {
  const naturalWidth = image.width || 320;
  const naturalHeight = image.height || 240;
  const scale = Math.min(1, 720 / naturalWidth, 520 / naturalHeight);
  return {
    width: Math.max(28, Math.round(naturalWidth * scale)),
    height: Math.max(24, Math.round(naturalHeight * scale)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointHitsNode(x: number, y: number, node: CanvasNode) {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
}

function rectFromPoints(startX: number, startY: number, currentX: number, currentY: number) {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

function rectIntersectsNode(rect: { x: number; y: number; width: number; height: number }, node: CanvasNode) {
  return rect.x <= node.x + node.width && rect.x + rect.width >= node.x && rect.y <= node.y + node.height && rect.y + rect.height >= node.y;
}

function moveNodeLayer(nodes: CanvasNode[], ids: string[], action: "front" | "back" | "forward" | "backward") {
  const selected = new Set(ids);
  if (!nodes.some((node) => selected.has(node.id))) return nodes;
  if (action === "front" || action === "back") {
    const moving = nodes.filter((node) => selected.has(node.id));
    const rest = nodes.filter((node) => !selected.has(node.id));
    return action === "front" ? [...rest, ...moving] : [...moving, ...rest];
  }
  const next = [...nodes];
  if (action === "forward") {
    for (let index = next.length - 2; index >= 0; index -= 1) {
      if (!selected.has(next[index].id) || selected.has(next[index + 1].id)) continue;
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
    }
  }
  if (action === "backward") {
    for (let index = 1; index < next.length; index += 1) {
      if (!selected.has(next[index].id) || selected.has(next[index - 1].id)) continue;
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
    }
  }
  return next;
}

function linkKeyFromLabel(label: string, fallback: string) {
  const normalized = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return normalized || fallback;
}

function linkKeyForIndex(prefix: string, label: string, index: number) {
  return `${prefix}:${linkKeyFromLabel(label, String(index))}:${index}`;
}

function linkLabel(link: CanvasLink | undefined, wireframes: Wireframe[]) {
  if (!link) return "No Link";
  if (link.kind === "back") return "Go Back";
  if (link.kind === "url") return link.url || "Web Address";
  return wireframes.find((wireframe) => wireframe.id === link.wireframeId)?.name ?? "Missing Wireframe";
}

function uniqueWireframeName(baseName: string, wireframes: Wireframe[]) {
  const normalizedNames = new Set(wireframes.map((wireframe) => wireframe.name.trim().toLowerCase()));
  const cleanBaseName = baseName.trim() || "Wireframe";
  if (!normalizedNames.has(cleanBaseName.toLowerCase())) return cleanBaseName;
  for (let index = 2; ; index += 1) {
    const candidate = `${cleanBaseName} ${index}`;
    if (!normalizedNames.has(candidate.toLowerCase())) return candidate;
  }
}

function resizeBoundsFromHandle(state: Extract<DragState, { kind: "resize" }>, clientX: number, clientY: number) {
  const minWidth = 28;
  const minHeight = 24;
  const deltaX = Math.round(clientX - state.startX);
  const deltaY = Math.round(clientY - state.startY);
  const originalRight = state.originalX + state.originalWidth;
  const originalBottom = state.originalY + state.originalHeight;
  let x = state.originalX;
  let y = state.originalY;
  let width = state.originalWidth;
  let height = state.originalHeight;

  if (state.handle.includes("e")) {
    width = Math.max(minWidth, state.originalWidth + deltaX);
  }
  if (state.handle.includes("s")) {
    height = Math.max(minHeight, state.originalHeight + deltaY);
  }
  if (state.handle.includes("w")) {
    x = Math.min(originalRight - minWidth, Math.max(0, state.originalX + deltaX));
    width = originalRight - x;
  }
  if (state.handle.includes("n")) {
    y = Math.min(originalBottom - minHeight, Math.max(0, state.originalY + deltaY));
    height = originalBottom - y;
  }

  return { x, y, width, height };
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function projectNameFromPath(path: string) {
  return decodeTitleFromFilename(fileNameFromPath(path).replace(/\.(moq|moqira|dsmockup|json)$/i, "")) || "Untitled Project";
}

function defaultSaveFileName(project: MockupProject, projectPath: string | null) {
  if (projectPath) return fileNameFromPath(projectPath);
  const baseName = project.name.trim() && project.name !== "New Project" ? project.name.trim() : "Untitled Project";
  return `${encodeTitleForFilename(baseName)}.moq`;
}

function projectSnapshot(project: MockupProject) {
  return JSON.stringify(project);
}

function dirtyProjectSnapshot(project: MockupProject) {
  return projectSnapshot({ ...project, activeWireframeId: "" });
}

function createProjectHistory(project: MockupProject): ProjectHistory {
  return { past: [], present: project, future: [] };
}

function pushHistoryEntry(past: MockupProject[], project: MockupProject) {
  return [...past, project].slice(-maxProjectHistoryEntries);
}

function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<ProjectHistory>(() => createProjectHistory(createDefaultProject()));
  const [appAppearance, setAppAppearance] = useState<MockupProject["appearance"]>(() => {
    const appearance = defaultAppearance();
    appearance.colorScheme = (readStoredValue(themeKey, legacyThemeKey) as MockupProject["appearance"]["colorScheme"]) || appearance.colorScheme;
    appearance.accentColor = readStoredValue(accentKey, legacyAccentKey) || appearance.accentColor;
    appearance.appFontFamily = readStoredValue(appFontFamilyKey, legacyAppFontFamilyKey) || appearance.appFontFamily;
    appearance.appFontSize = Number(readStoredValue(appFontSizeKey, legacyAppFontSizeKey)) || appearance.appFontSize;
    appearance.accentTitlebar = readStoredValue(accentTitlebarKey, legacyAccentTitlebarKey) === "true";
    return appearance;
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<CanvasNode[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [wireframeContextMenu, setWireframeContextMenu] = useState<WireframeContextMenuState | null>(null);
  const [renameWireframe, setRenameWireframe] = useState<RenameWireframeState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [selectionRect, setSelectionRect] = useState<SelectionRectState | null>(null);
  const [snapGuides, setSnapGuides] = useState<number[]>([]);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const textEditorRef = useRef<TextEditorState | null>(null);
  const [status, setStatus] = useState("Ready");
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => readRecentProjects());
  const [activeComponentCategory, setActiveComponentCategory] = useState<ComponentCategory>("All");
  const [quickAccessQuery, setQuickAccessQuery] = useState("");
  const [quickAccessOpen, setQuickAccessOpen] = useState(false);
  const [quickAccessIndex, setQuickAccessIndex] = useState(0);
  const [interactiveSelect, setInteractiveSelect] = useState<InteractiveSelectState | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => localStorage.getItem(leftPaneCollapsedKey) === "true");
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => localStorage.getItem(rightPaneCollapsedKey) === "true");

  useEffect(() => {
    localStorage.setItem(leftPaneCollapsedKey, String(leftCollapsed));
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem(rightPaneCollapsedKey, String(rightCollapsed));
  }, [rightCollapsed]);
  useEffect(() => {
    if (!interactiveMode) return;
    setSelectedIds([]);
    textEditorRef.current = null;
    setTextEditor(null);
    setContextMenu(null);
    setDragState(null);
    setSnapGuides([]);
  }, [interactiveMode]);
  useEffect(() => {
    if (!interactiveMode) setInteractiveSelect(null);
  }, [interactiveMode]);
  useEffect(() => {
    setInteractiveSelect(null);
  }, [projectHistory.present.activeWireframeId]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const suppressNextLibraryClickRef = useRef(false);
  const pendingCanvasPasteRef = useRef<number | null>(null);
  const wireframeNavigationStackRef = useRef<string[]>([]);
  const openingProjectRef = useRef(false);
  const projectDialogOpenRef = useRef(false);
  const attemptedStartupRestoreRef = useRef(false);
  const dirtyRef = useRef(false);
  const activeProjectHistoryGroupKeyRef = useRef<string | null>(null);
  const savedProjectSnapshotRef = useRef(dirtyProjectSnapshot(projectHistory.present));
  const project = projectHistory.present;
  const dirty = dirtyProjectSnapshot(project) !== savedProjectSnapshotRef.current;

  const pastePointForSize = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    const scroller = canvas?.parentElement;
    if (!canvas || !scroller) return { x: 120, y: 120 };
    const x = scroller.scrollLeft + (scroller.clientWidth - width) / 2;
    const y = scroller.scrollTop + (scroller.clientHeight - height) / 2;
    return {
      x: Math.max(0, Math.round(x)),
      y: Math.max(0, Math.round(y)),
    };
  }, []);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    void syncRecentProjects(recentProjects);
  }, [recentProjects]);

  const activeWireframe = useMemo(
    () => project.wireframes.find((wireframe) => wireframe.id === project.activeWireframeId) ?? project.wireframes[0],
    [project.activeWireframeId, project.wireframes],
  );
  const selectedId = selectedIds.at(-1) ?? null;
  const selectedNode = activeWireframe?.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedNodes = useMemo(() => {
    if (!activeWireframe) return [];
    const selected = new Set(selectedIds);
    return activeWireframe.nodes.filter((node) => selected.has(node.id));
  }, [activeWireframe, selectedIds]);
  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
  }, []);
  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds(Array.from(new Set(ids)));
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);
  const setSelectedId = selectOnly;
  const activeWireframeBackground = wireframeBackground(activeWireframe);
  const activeWireframeShowGrid = wireframeShowGrid(activeWireframe);
  const visibleComponentLibrary = useMemo(() => {
    const definitions = componentLibrary.filter((definition) => activeComponentCategory === "All" || componentCategoryNames(definition).includes(activeComponentCategory));
    if (activeComponentCategory === "All") return [...definitions].sort((a, b) => a.label.localeCompare(b.label));
    if (activeComponentCategory !== "Common") return definitions;
    return [...definitions].sort((a, b) => {
      const aRank = commonComponentRank.get(a.kind) ?? Number.MAX_SAFE_INTEGER;
      const bRank = commonComponentRank.get(b.kind) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
  }, [activeComponentCategory]);
  const quickAccessMatches = useMemo(() => {
    const query = quickAccessQuery.trim().toLowerCase();
    const matches = query
      ? componentLibrary
          .map((definition, index) => ({ definition, index, score: quickAccessScore(definition, query) }))
          .filter((item) => Number.isFinite(item.score))
          .sort((a, b) => a.score - b.score || a.index - b.index)
          .map((item) => item.definition)
      : componentLibrary.slice(0, 8);
    return matches.slice(0, 8);
  }, [quickAccessQuery]);

  useEffect(() => {
    setQuickAccessIndex(0);
  }, [quickAccessQuery]);

  useEffect(() => {
    void syncEditMenuState({
      canUndo: projectHistory.past.length > 0,
      canRedo: projectHistory.future.length > 0,
      hasSelection: selectedIds.length > 0,
      canPaste: true,
      canLockSelection: selectedNodes.some((node) => !node.locked),
      hasLockedNodes: Boolean(activeWireframe?.nodes.some((node) => node.locked)),
    });
  }, [activeWireframe?.nodes, clipboard.length, projectHistory.future.length, projectHistory.past.length, selectedIds.length, selectedNodes]);

  const startTitlebarDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, textarea, select, a")) return;
    if (!isTauri()) return;
    void getCurrentWindow().startDragging();
  };

  useEffect(() => {
    document.documentElement.dataset.theme = appAppearance.colorScheme;
    document.documentElement.style.setProperty("--accent", appAppearance.accentColor);
    document.documentElement.style.setProperty("--app-font-family", appAppearance.appFontFamily);
    document.documentElement.style.setProperty("--app-font-size", `${appAppearance.appFontSize}px`);
    localStorage.setItem(themeKey, appAppearance.colorScheme);
    localStorage.setItem(accentKey, appAppearance.accentColor);
    localStorage.setItem(appFontFamilyKey, appAppearance.appFontFamily);
    localStorage.setItem(appFontSizeKey, String(appAppearance.appFontSize));
    localStorage.setItem(accentTitlebarKey, String(appAppearance.accentTitlebar));
  }, [appAppearance]);

  useEffect(() => {
    if (!saveToast) return;
    const timeout = window.setTimeout(() => setSaveToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [saveToast]);

  const endProjectHistoryGroup = useCallback(() => {
    activeProjectHistoryGroupKeyRef.current = null;
  }, []);

  const resetProjectHistory = useCallback((nextProject: MockupProject, saved = true) => {
    endProjectHistoryGroup();
    setProjectHistory(createProjectHistory(nextProject));
    if (saved) savedProjectSnapshotRef.current = dirtyProjectSnapshot(nextProject);
  }, [endProjectHistoryGroup]);

  const commitProjectChange = useCallback(
    (updater: (project: MockupProject) => MockupProject, options: ProjectChangeOptions = {}) => {
      setProjectHistory((current) => {
        const nextProject = updater(current.present);
        if (projectSnapshot(nextProject) === projectSnapshot(current.present)) return current;

        const isSameGroup = Boolean(options.groupKey) && activeProjectHistoryGroupKeyRef.current === options.groupKey;
        activeProjectHistoryGroupKeyRef.current = options.groupKey ?? null;

        return {
          past: isSameGroup ? current.past : pushHistoryEntry(current.past, current.present),
          present: nextProject,
          future: [],
        };
      });
    },
    [],
  );

  const undoProjectChange = useCallback(() => {
    endProjectHistoryGroup();
    setProjectHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
    setSelectedId(null);
    setStatus("Undid last change");
  }, [endProjectHistoryGroup, setSelectedId]);

  const redoProjectChange = useCallback(() => {
    endProjectHistoryGroup();
    setProjectHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: pushHistoryEntry(current.past, current.present),
        present: next,
        future: current.future.slice(1),
      };
    });
    setSelectedId(null);
    setStatus("Redid last change");
  }, [endProjectHistoryGroup, setSelectedId]);

  useEffect(() => {
    if (attemptedStartupRestoreRef.current || !isTauri()) return;
    attemptedStartupRestoreRef.current = true;

    Promise.resolve(readStoredValue(projectPathKey, legacyProjectPathKey))
      .then((localPath) => localPath || readLastProjectPath())
      .then((rememberedPath) => {
        if (!rememberedPath) return null;
        return openProjectFile(rememberedPath).then((loadedProject) => ({ rememberedPath, loadedProject }));
      })
      .then((loadedProject) => {
        if (!loadedProject) {
          setStatus("Ready");
          return;
        }
        const projectName = projectNameFromPath(loadedProject.rememberedPath);
        const restoredProject = { ...loadedProject.loadedProject, name: projectName };
        resetProjectHistory(restoredProject);
        setProjectPath(loadedProject.rememberedPath);
        setSelectedId(null);
        localStorage.setItem(projectPathKey, loadedProject.rememberedPath);
        void writeLastProjectPath(loadedProject.rememberedPath);
        setRecentProjects((current) => addRecentProject(current, loadedProject.rememberedPath, projectName));
        setStatus(`Opened ${projectName}`);
      })
      .catch((error) => {
        console.warn("Could not reopen last project", error);
        setStatus("Could not reopen last project.");
      });
  }, [resetProjectHistory, setSelectedId]);

  const mutateProject = useCallback((updater: (project: MockupProject) => MockupProject, options?: ProjectChangeOptions) => {
    commitProjectChange(updater, options);
  }, [commitProjectChange]);

  const mutateActiveWireframe = useCallback(
    (updater: (wireframe: Wireframe) => Wireframe, options?: ProjectChangeOptions) => {
      mutateProject((current) => ({
        ...current,
        wireframes: current.wireframes.map((wireframe) => (wireframe.id === current.activeWireframeId ? updater(wireframe) : wireframe)),
      }), options);
    },
    [mutateProject],
  );

  const updateActiveWireframe = useCallback(
    (patch: Partial<Wireframe>) => {
      mutateActiveWireframe((wireframe) => ({ ...wireframe, ...patch }));
    },
    [mutateActiveWireframe],
  );

  const addNode = useCallback(
    (kind: ComponentKind, x = 120, y = 120) => {
      const node = createNode(kind, Math.round(x), Math.round(y));
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      setStatus(`Added ${node.name}`);
    },
    [mutateActiveWireframe, setSelectedId],
  );

  const addImageNode = useCallback(
    (image: ClipboardImage, x?: number, y?: number) => {
      const size = imageNodeDisplaySize(image);
      const point = x === undefined || y === undefined ? pastePointForSize(size.width, size.height) : { x: Math.round(x), y: Math.round(y) };
      const node: CanvasNode = {
        ...createNode("image", point.x, point.y),
        width: size.width,
        height: size.height,
        imageDataUrl: image.dataUrl,
        imageMimeType: image.mimeType,
        imageNaturalWidth: image.width,
        imageNaturalHeight: image.height,
      };
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      setStatus("Pasted image");
      return node;
    },
    [mutateActiveWireframe, pastePointForSize, setSelectedId],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => {
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: wireframe.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      }), options);
    },
    [mutateActiveWireframe],
  );

  const previewNode = useCallback((id: string, patch: Partial<CanvasNode>) => {
    endProjectHistoryGroup();
    setProjectHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? { ...wireframe, nodes: wireframe.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) }
            : wireframe,
        ),
      },
    }));
  }, [endProjectHistoryGroup]);

  const previewNodes = useCallback((patches: Record<string, Partial<CanvasNode>>) => {
    endProjectHistoryGroup();
    setProjectHistory((current) => ({
      ...current,
      present: {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? { ...wireframe, nodes: wireframe.nodes.map((node) => (patches[node.id] ? { ...node, ...patches[node.id] } : node)) }
            : wireframe,
        ),
      },
    }));
  }, [endProjectHistoryGroup]);

  const commitNodeDrag = useCallback((state: DragState) => {
    setProjectHistory((current) => {
      const originalProject = {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? {
                ...wireframe,
                nodes: wireframe.nodes.map((node) => {
                  if (state.kind === "move") {
                    const originalPosition = state.originalPositions[node.id];
                    return originalPosition ? { ...node, ...originalPosition } : node;
                  }
                  if (node.id !== state.nodeId) return node;
                  return { ...node, x: state.originalX, y: state.originalY, width: state.originalWidth, height: state.originalHeight };
                }),
              }
            : wireframe,
        ),
      };
      if (projectSnapshot(originalProject) === projectSnapshot(current.present)) return current;
      return {
        past: pushHistoryEntry(current.past, originalProject),
        present: current.present,
        future: [],
      };
    });
  }, []);

  const beginTextEdit = useCallback((node: CanvasNode) => {
    const field = editableTextField(node);
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!field || !canvasRect) return;

    const draft = field === "options" ? optionsEditDraft(node) : node.text ?? "";
    const multiline = isMultilineTextNode(node, field, draft);
    const lineCount = Math.max(1, draft.split("\n").length);
    const maxEditorHeight = Math.max(142, Math.floor(canvasRect.height * 0.4));
    const naturalEditorHeight = multiline ? 56 + lineCount * 28 : 96;
    const nodeViewportX = canvasRect.left + node.x;
    const nodeViewportY = canvasRect.top + node.y;
    const width = Math.max(multiline ? 420 : 360, node.width + 220);
    const height = multiline ? clamp(Math.max(170, node.height + 82, naturalEditorHeight), 170, maxEditorHeight) : 96;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    setSelectedId(node.id);
    const nextEditor = {
      nodeId: node.id,
      field,
      draft,
      x: clamp(nodeViewportX - 12, 12, maxX),
      y: clamp(nodeViewportY + Math.min(24, node.height), 12, maxY),
      width,
      height,
      maxHeight: maxEditorHeight,
      multiline,
    };
    textEditorRef.current = nextEditor;
    setTextEditor(nextEditor);
  }, [setSelectedId]);

  const closeTextEditor = useCallback(
    (commit: boolean, draftOverride?: string) => {
      const editor = textEditorRef.current;
      if (!editor) return;
      if (commit) {
        const node = project.wireframes.flatMap((wireframe) => wireframe.nodes).find((item) => item.id === editor.nodeId);
        if (!node) {
          textEditorRef.current = null;
          setTextEditor(null);
          return;
        }
        const draft = draftOverride ?? editor.draft;
        const patch =
          editor.field === "options"
            ? { options: parseOptionsEditDraft(node, draft) }
            : { text: draft };
        updateNode(editor.nodeId, patch);
      }
      textEditorRef.current = null;
      setTextEditor(null);
    },
    [project.wireframes, updateNode],
  );

  const deleteNode = useCallback(
    (id?: string | null) => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      const deleted = new Set(ids);
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: wireframe.nodes.filter((node) => !deleted.has(node.id)) }));
      setSelectedIds((current) => current.filter((item) => !deleted.has(item)));
      setStatus(ids.length === 1 ? "Deleted component" : `Deleted ${ids.length} components`);
    },
    [mutateActiveWireframe, selectedIds],
  );

  const duplicateNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const selected = new Set(sourceIds);
      const nodes = activeWireframe?.nodes.filter((item) => selected.has(item.id)) ?? [];
      if (!nodes.length) return;
      const duplicatesById = new Map(nodes.map((node) => [node.id, { ...node, id: createId("node"), x: node.x + 24, y: node.y + 24 }]));
      mutateActiveWireframe((wireframe) => {
        const nextNodes = wireframe.nodes.flatMap((item) => {
          const duplicate = duplicatesById.get(item.id);
          return duplicate ? [item, duplicate] : [item];
        });
        return { ...wireframe, nodes: nextNodes };
      });
      selectMany(Array.from(duplicatesById.values()).map((node) => node.id));
      setStatus(nodes.length === 1 ? `Duplicated ${nodes[0].name}` : `Duplicated ${nodes.length} components`);
    },
    [activeWireframe?.nodes, mutateActiveWireframe, selectMany, selectedIds],
  );

  const copyNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const selected = new Set(sourceIds);
      const nodes = activeWireframe?.nodes.filter((item) => selected.has(item.id)) ?? [];
      if (!nodes.length) return;
      setClipboard(nodes);
      setStatus(nodes.length === 1 ? `Copied ${nodes[0].name}` : `Copied ${nodes.length} components`);
    },
    [activeWireframe?.nodes, selectedIds],
  );

  const cutNode = useCallback(
    (id?: string | null) => {
      const sourceIds = id ? [id] : selectedIds;
      const selected = new Set(sourceIds);
      const nodes = activeWireframe?.nodes.filter((item) => selected.has(item.id)) ?? [];
      if (!nodes.length) return;
      setClipboard(nodes);
      deleteNode(id);
      setStatus(nodes.length === 1 ? `Cut ${nodes[0].name}` : `Cut ${nodes.length} components`);
    },
    [activeWireframe?.nodes, deleteNode, selectedIds],
  );

  const pasteNode = useCallback(
    async (x?: number, y?: number) => {
      const image = await readClipboardImage();
      if (image) {
        addImageNode(image, x, y);
        return;
      }
      if (!clipboard.length) {
        setStatus("Clipboard is empty");
        return;
      }
      const minX = Math.min(...clipboard.map((node) => node.x));
      const minY = Math.min(...clipboard.map((node) => node.y));
      const offsetX = x === undefined ? 24 : Math.round(x - minX);
      const offsetY = y === undefined ? 24 : Math.round(y - minY);
      const nodes = clipboard.map((item) => ({
        ...item,
        id: createId("node"),
        x: Math.round(item.x + offsetX),
        y: Math.round(item.y + offsetY),
        name: item.name,
      }));
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, ...nodes] }));
      selectMany(nodes.map((node) => node.id));
      setStatus(nodes.length === 1 ? `Pasted ${nodes[0].name}` : `Pasted ${nodes.length} components`);
    },
    [addImageNode, clipboard, mutateActiveWireframe, selectMany],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (interactiveMode) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const imageBlob = imageBlobFromDataTransfer(event.clipboardData);
      if (!imageBlob) return;
      event.preventDefault();
      pendingCanvasPasteRef.current = null;
      void clipboardImageFromBlob(imageBlob.blob, imageBlob.mimeType).then((image) => addImageNode(image));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImageNode, interactiveMode]);

  const layerNode = useCallback(
    (id: string | null, action: "front" | "back" | "forward" | "backward") => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: moveNodeLayer(wireframe.nodes, ids, action) }));
    },
    [mutateActiveWireframe, selectedIds],
  );

  const lockNode = useCallback(
    (id?: string | null) => {
      const ids = id ? [id] : selectedIds;
      if (!ids.length) return;
      const locked = new Set(ids);
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: wireframe.nodes.map((node) => (locked.has(node.id) ? { ...node, locked: true } : node)),
      }));
      setStatus(ids.length === 1 ? "Locked component" : `Locked ${ids.length} components`);
    },
    [mutateActiveWireframe, selectedIds],
  );

  const unlockAllNodes = useCallback(() => {
    mutateActiveWireframe((wireframe) => ({
      ...wireframe,
      nodes: wireframe.nodes.map((node) => (node.locked ? { ...node, locked: false } : node)),
    }));
    setStatus("Unlocked all components");
  }, [mutateActiveWireframe]);

  const selectNone = useCallback(() => {
    closeTextEditor(true);
    setSelectedId(null);
    setContextMenu(null);
    setStatus("Cleared selection");
  }, [closeTextEditor, setSelectedId]);

  const selectWireframe = useCallback((wireframeId: string) => {
    endProjectHistoryGroup();
    setProjectHistory((current) =>
      current.present.activeWireframeId === wireframeId
        ? current
        : { ...current, present: { ...current.present, activeWireframeId: wireframeId } },
    );
    setSelectedId(null);
  }, [endProjectHistoryGroup, setSelectedId]);

  const followLink = useCallback(
    (link: CanvasLink | undefined) => {
      if (!link) return;
      if (link.kind === "url") {
        if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (link.kind === "back") {
        const previousWireframeId = wireframeNavigationStackRef.current.pop();
        if (previousWireframeId && project.wireframes.some((wireframe) => wireframe.id === previousWireframeId)) {
          selectWireframe(previousWireframeId);
          setStatus("Went back");
        }
        return;
      }
      if (link.wireframeId === project.activeWireframeId) return;
      if (!project.wireframes.some((wireframe) => wireframe.id === link.wireframeId)) return;
      if (project.activeWireframeId) wireframeNavigationStackRef.current.push(project.activeWireframeId);
      selectWireframe(link.wireframeId);
      setStatus(`Opened ${linkLabel(link, project.wireframes)}`);
    },
    [project.activeWireframeId, project.wireframes, selectWireframe],
  );

  const followNodeLink = useCallback(
    (node: CanvasNode, key: string) => {
      followLink(node.links?.[key] ?? node.links?.whole);
    },
    [followLink],
  );

  const toggleInteractiveSelect = useCallback((node: CanvasNode) => {
    if (node.kind !== "dropdown" && node.kind !== "comboBox") return;
    setInteractiveSelect((current) => ({
      nodeId: node.id,
      selectedIndex: current?.nodeId === node.id ? current.selectedIndex : null,
      open: current?.nodeId === node.id ? !current.open : true,
    }));
  }, []);

  const confirmLosingUnsavedChanges = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("This project has unsaved changes. Continue without saving them?");
  }, [dirty]);

  const saveProject = useCallback(
    async (saveAs = false): Promise<boolean> => {
      let nextPath = saveAs ? null : projectPath;
      if (!nextPath || saveAs) {
        if (projectDialogOpenRef.current) return false;
        projectDialogOpenRef.current = true;
        try {
          const chosen = await saveDialog({
            title: "Save Moqira Project",
            defaultPath: defaultSaveFileName(project, saveAs ? null : projectPath),
            filters: [{ name: "Moqira Project", extensions: ["moq", "moqira", "dsmockup", "json"] }],
          });
          if (!chosen) {
            setStatus(saveAs ? "Save As canceled." : "Save canceled.");
            return false;
          }
          nextPath = chosen;
        } finally {
          projectDialogOpenRef.current = false;
        }
      }
      const projectToSave = { ...project, name: projectNameFromPath(nextPath) };
      await saveProjectFile(nextPath, projectToSave);
      endProjectHistoryGroup();
      setProjectHistory((current) => ({ ...current, present: projectToSave }));
      setProjectPath(nextPath);
      localStorage.setItem(projectPathKey, nextPath);
      await writeLastProjectPath(nextPath);
      setRecentProjects((current) => addRecentProject(current, nextPath, projectToSave.name));
      savedProjectSnapshotRef.current = dirtyProjectSnapshot(projectToSave);
      setStatus(`Saved to ${nextPath}`);
      setSaveToast(`Saved ${fileNameFromPath(nextPath)}`);
      return true;
    },
    [endProjectHistoryGroup, project, projectPath],
  );

  const closeWindow = useCallback(async () => {
    await getCurrentWindow().destroy();
  }, []);

  const handleCloseRequest = useCallback(() => {
    if (dirtyRef.current) {
      setClosePromptOpen(true);
      return;
    }
    void closeWindow();
  }, [closeWindow]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen("mockups-window-close-requested", handleCloseRequest).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [handleCloseRequest]);

  const openProject = useCallback(async () => {
    if (openingProjectRef.current) return;
    if (projectDialogOpenRef.current) return;
    if (!confirmLosingUnsavedChanges()) return;
    openingProjectRef.current = true;
    projectDialogOpenRef.current = true;
    try {
      const chosen = await openDialog({
        title: "Open Moqira Project",
        multiple: false,
      });
      if (!chosen || Array.isArray(chosen)) return;
      const loaded = await openProjectFile(chosen);
      const projectName = projectNameFromPath(chosen);
      resetProjectHistory({ ...loaded, name: projectName });
      setProjectPath(chosen);
      localStorage.setItem(projectPathKey, chosen);
      await writeLastProjectPath(chosen);
      setRecentProjects((current) => addRecentProject(current, chosen, projectName));
      setSelectedId(null);
      setStatus(`Opened ${projectName}`);
    } finally {
      openingProjectRef.current = false;
      projectDialogOpenRef.current = false;
    }
  }, [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId]);

  const openRecentProject = useCallback(
    async (path: string) => {
      if (!confirmLosingUnsavedChanges()) return;
      try {
        const loaded = await openProjectFile(path);
        const projectName = projectNameFromPath(path);
        resetProjectHistory({ ...loaded, name: projectName });
        setProjectPath(path);
        localStorage.setItem(projectPathKey, path);
        await writeLastProjectPath(path);
        setRecentProjects((current) => addRecentProject(current, path, projectName));
        setSelectedId(null);
        setStatus(`Opened ${projectName}`);
      } catch (error) {
        console.warn("Could not open recent project", error);
        setRecentProjects((current) => {
          const next = current.filter((project) => project.path !== path);
          writeRecentProjects(next);
          return next;
        });
        setStatus(`Could not open ${fileNameFromPath(path)}`);
      }
    },
    [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId],
  );

  const newProject = useCallback(() => {
    if (!confirmLosingUnsavedChanges()) return;
    resetProjectHistory(createDefaultProject());
    setProjectPath(null);
    setSelectedId(null);
    setStatus("Created new project");
  }, [confirmLosingUnsavedChanges, resetProjectHistory, setSelectedId]);

  const menuActionsRef = useRef<MenuActions>({
    newProject: () => {},
    newWireframe: () => {},
    openProject: () => {},
    saveProject: async () => false,
    undoProjectChange: () => {},
    redoProjectChange: () => {},
    cutNode: () => {},
    copyNode: () => {},
    pasteNode: () => {},
    deleteNode: () => {},
    duplicateNode: () => {},
    selectNone: () => {},
    layerNode: () => {},
    lockNode: () => {},
    unlockAllNodes: () => {},
    openSettings: () => {},
    openRecentProject: () => {},
  });

  menuActionsRef.current = {
    newProject,
    newWireframe: addWireframe,
    openProject,
    saveProject,
    undoProjectChange,
    redoProjectChange,
    cutNode,
    copyNode,
    pasteNode,
    deleteNode,
    duplicateNode,
    selectNone,
    layerNode: (action) => layerNode(null, action),
    lockNode,
    unlockAllNodes,
    openSettings: () => {
      setSelectedId(null);
      setSettingsOpen(true);
    },
    openRecentProject: (path) => void openRecentProject(path),
  };

  useEffect(() => {
    if (!isTauri()) return;
    const cleanups: Array<() => void> = [];
    let disposed = false;
    const runAfterMenuCloses = (action: () => void) => {
      window.setTimeout(action, 0);
    };
    const addMenuListener = <T,>(eventName: string, handler: (event: { payload: T }) => void) => {
      void listen<T>(eventName, handler).then((cleanup) => {
        if (disposed) cleanup();
        else cleanups.push(cleanup);
      });
    };

    addMenuListener("menu-new-project", () => menuActionsRef.current.newProject());
    addMenuListener("menu-new-wireframe", () => menuActionsRef.current.newWireframe());
    addMenuListener("menu-open-project", () => runAfterMenuCloses(() => void menuActionsRef.current.openProject()));
    addMenuListener("menu-save-project", () => void menuActionsRef.current.saveProject(false));
    addMenuListener("menu-save-project-as", () => runAfterMenuCloses(() => void menuActionsRef.current.saveProject(true)));
    addMenuListener("menu-undo-project", () => menuActionsRef.current.undoProjectChange());
    addMenuListener("menu-redo-project", () => menuActionsRef.current.redoProjectChange());
    addMenuListener("menu-cut-node", () => {
      if (!runEditableClipboardAction("cut", true)) menuActionsRef.current.cutNode();
    });
    addMenuListener("menu-copy-node", () => {
      if (!runEditableClipboardAction("copy", true)) menuActionsRef.current.copyNode();
    });
    addMenuListener("menu-paste-node", () => {
      if (!runEditableClipboardAction("paste")) void menuActionsRef.current.pasteNode();
    });
    addMenuListener("menu-delete-node", () => menuActionsRef.current.deleteNode());
    addMenuListener("menu-duplicate-node", () => menuActionsRef.current.duplicateNode());
    addMenuListener("menu-select-none", () => menuActionsRef.current.selectNone());
    addMenuListener("menu-layer-front", () => menuActionsRef.current.layerNode("front"));
    addMenuListener("menu-layer-forward", () => menuActionsRef.current.layerNode("forward"));
    addMenuListener("menu-layer-backward", () => menuActionsRef.current.layerNode("backward"));
    addMenuListener("menu-layer-back", () => menuActionsRef.current.layerNode("back"));
    addMenuListener("menu-lock-node", () => menuActionsRef.current.lockNode());
    addMenuListener("menu-unlock-all-nodes", () => menuActionsRef.current.unlockAllNodes());
    addMenuListener("menu-open-settings", () => menuActionsRef.current.openSettings());
    addMenuListener<string>("menu-open-recent-project", (event) => menuActionsRef.current.openRecentProject(event.payload));

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      event.preventDefault();
      if (dragState.kind === "move") {
        const node = activeWireframe?.nodes.find((item) => item.id === dragState.nodeIds[0]);
        if (!node) return;
        const originalPosition = dragState.originalPositions[node.id];
        if (!originalPosition) return;
        const rawX = Math.max(0, Math.round(originalPosition.x + event.clientX - dragState.startX));
        const rawY = Math.max(0, Math.round(originalPosition.y + event.clientY - dragState.startY));
        const canvasWidth = canvasRef.current?.clientWidth ?? 0;
        const threshold = 6;
        const targets: number[] = [];
        if (canvasWidth) targets.push(canvasWidth / 2);
        const draggedIds = new Set(dragState.nodeIds);
        for (const other of activeWireframe?.nodes ?? []) {
          if (draggedIds.has(other.id)) continue;
          targets.push(other.x, other.x + other.width / 2, other.x + other.width);
        }
        let best: { x: number; lines: number[]; dist: number } = { x: rawX, lines: [], dist: threshold + 1 };
        for (const target of targets) {
          for (const edge of [0, node.width / 2, node.width]) {
            const snapped = Math.round(target - edge);
            const dist = Math.abs(snapped - rawX);
            if (dist < best.dist) best = { x: snapped, lines: [target], dist };
            else if (dist === best.dist && best.x === snapped && !best.lines.includes(target)) best.lines.push(target);
          }
        }
        const finalX = best.dist <= threshold ? best.x : rawX;
        const deltaX = finalX - originalPosition.x;
        const deltaY = rawY - originalPosition.y;
        const patches = Object.fromEntries(
          dragState.nodeIds.flatMap((id) => {
            const position = dragState.originalPositions[id];
            return position ? [[id, { x: Math.max(0, position.x + deltaX), y: Math.max(0, position.y + deltaY) }]] : [];
          }),
        );
        setSnapGuides(best.dist <= threshold ? best.lines : []);
        setDragState({ ...dragState, currentX: finalX, currentY: rawY });
        previewNodes(patches);
      } else {
        const nextBounds = resizeBoundsFromHandle(dragState, event.clientX, event.clientY);
        setDragState({ ...dragState, ...nextBounds, currentX: nextBounds.x, currentY: nextBounds.y, currentWidth: nextBounds.width, currentHeight: nextBounds.height });
        previewNode(dragState.nodeId, nextBounds);
      }
    };
    const onPointerUp = () => {
      if (dragState) commitNodeDrag(dragState);
      endProjectHistoryGroup();
      setDragState(null);
      setSnapGuides([]);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeWireframe?.nodes, commitNodeDrag, dragState, endProjectHistoryGroup, previewNode, previewNodes]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!paletteDrag) return;
      const moved = paletteDrag.moved || Math.hypot(event.clientX - paletteDrag.startX, event.clientY - paletteDrag.startY) > 4;
      setPaletteDrag({ ...paletteDrag, x: event.clientX, y: event.clientY, moved });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!paletteDrag) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      const droppedOnCanvas =
        rect && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      if (paletteDrag.moved) {
        suppressNextLibraryClickRef.current = true;
        if (!interactiveMode && droppedOnCanvas && rect) {
          addNode(paletteDrag.kind, event.clientX - rect.left, event.clientY - rect.top);
        }
      }
      setPaletteDrag(null);
      window.setTimeout(() => {
        suppressNextLibraryClickRef.current = false;
      }, 0);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [addNode, interactiveMode, paletteDrag]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!selectionRect) return;
      event.preventDefault();
      const point = canvasPointFromEvent(event);
      const moved = selectionRect.moved || Math.hypot(point.x - selectionRect.startX, point.y - selectionRect.startY) > 4;
      setSelectionRect({ ...selectionRect, currentX: point.x, currentY: point.y, moved });
    };
    const onPointerUp = () => {
      if (!selectionRect) return;
      if (selectionRect.moved) {
        const rect = rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY);
        const hits = (activeWireframe?.nodes ?? []).filter((node) => rectIntersectsNode(rect, node)).map((node) => node.id);
        selectMany(selectionRect.additive ? [...selectedIds, ...hits] : hits);
        setStatus(hits.length === 1 ? "Selected 1 component" : `Selected ${hits.length} components`);
        suppressCanvasClickRef.current = true;
        window.setTimeout(() => {
          suppressCanvasClickRef.current = false;
        }, 0);
      } else if (!selectionRect.additive) {
        selectOnly(null);
      }
      setSelectionRect(null);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeWireframe?.nodes, selectMany, selectOnly, selectedIds, selectionRect]);

  useEffect(() => {
    if (!interactiveMode || !interactiveSelect?.open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".interactive-select-menu, .node-dropdown, .node-comboBox")) return;
      setInteractiveSelect((current) => (current ? { ...current, open: false } : null));
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [interactiveMode, interactiveSelect?.open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const isEditingText = Boolean(target?.closest("input, textarea, select"));
      if (modifier && event.key.toLowerCase() === "z" && !isEditingText) {
        event.preventDefault();
        if (event.shiftKey) redoProjectChange();
        else undoProjectChange();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y" && !isEditingText) {
        event.preventDefault();
        redoProjectChange();
        return;
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if (interactiveMode) {
        if (event.key === "Escape") {
          event.preventDefault();
          if (interactiveSelect?.open) {
            setInteractiveSelect((current) => (current ? { ...current, open: false } : null));
            return;
          }
          setInteractiveMode(false);
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "c" && !isEditingText) {
        event.preventDefault();
        if (runEditableClipboardAction("copy")) return;
        copyNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "x" && !isEditingText) {
        event.preventDefault();
        if (runEditableClipboardAction("cut")) return;
        cutNode();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v" && !isEditingText) {
        if (runEditableClipboardAction("paste")) return;
        const pasteToken = Date.now();
        pendingCanvasPasteRef.current = pasteToken;
        window.setTimeout(() => {
          if (pendingCanvasPasteRef.current !== pasteToken) return;
          pendingCanvasPasteRef.current = null;
          void pasteNode();
        }, 0);
        return;
      }
      if (modifier && event.key.toLowerCase() === "d" && !isEditingText) {
        event.preventDefault();
        duplicateNode();
      }
      if (modifier && event.shiftKey && event.key.toLowerCase() === "a" && !isEditingText) {
        event.preventDefault();
        selectNone();
      }
      if (modifier && event.key === "2" && !isEditingText) {
        event.preventDefault();
        lockNode();
      }
      if (modifier && event.key === "3" && !isEditingText) {
        event.preventDefault();
        unlockAllNodes();
      }
      if (modifier && event.altKey && !isEditingText) {
        const layerShortcuts: Record<string, "front" | "back" | "forward" | "backward"> = {
          ArrowUp: event.shiftKey ? "front" : "forward",
          ArrowDown: event.shiftKey ? "back" : "backward",
        };
        const action = layerShortcuts[event.key];
        if (action) {
          event.preventDefault();
          layerNode(null, action);
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        deleteNode();
      }
      if (event.key === "Escape") {
        if (textEditor) {
          event.preventDefault();
          closeTextEditor(false);
          return;
        }
        setContextMenu(null);
        selectOnly(null);
      }
      if (selectedIds.length && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const selected = new Set(selectedIds);
        mutateActiveWireframe((wireframe) => ({
          ...wireframe,
          nodes: wireframe.nodes.map((node) =>
            selected.has(node.id)
              ? {
                  ...node,
                  x: Math.max(0, node.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0)),
                  y: Math.max(0, node.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0)),
                }
              : node,
          ),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeWireframe?.nodes,
    closeTextEditor,
    copyNode,
    cutNode,
    deleteNode,
    duplicateNode,
    interactiveSelect?.open,
    interactiveMode,
    layerNode,
    lockNode,
    mutateActiveWireframe,
    pasteNode,
    redoProjectChange,
    saveProject,
    selectOnly,
    selectNone,
    selectedId,
    selectedIds,
    textEditor,
    undoProjectChange,
    unlockAllNodes,
  ]);

  function addWireframe() {
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      activeWireframeId: id,
      wireframes: [...current.wireframes, { id, name: uniqueWireframeName(`Wireframe ${current.wireframes.length + 1}`, current.wireframes), background: "white", showGrid: true, nodes: [] }],
    }));
    setSelectedId(null);
  }

  const duplicateWireframe = (wireframeId = activeWireframe?.id) => {
    const sourceWireframe = project.wireframes.find((wireframe) => wireframe.id === wireframeId);
    if (!sourceWireframe) return;
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      activeWireframeId: id,
      wireframes: [
        ...current.wireframes,
        {
          id,
          name: uniqueWireframeName(`${sourceWireframe.name} copy`, current.wireframes),
          background: wireframeBackground(sourceWireframe),
          showGrid: wireframeShowGrid(sourceWireframe),
          nodes: sourceWireframe.nodes.map((node) => ({ ...node, id: createId("node"), x: node.x + 20, y: node.y + 20 })),
        },
      ],
    }));
    setSelectedId(null);
  };

  const deleteWireframe = (wireframeId = activeWireframe?.id) => {
    if (!wireframeId || project.wireframes.length === 1) return;
    mutateProject((current) => {
      const nextWireframes = current.wireframes.filter((wireframe) => wireframe.id !== wireframeId);
      const activeWireframeId = current.activeWireframeId === wireframeId ? nextWireframes[0].id : current.activeWireframeId;
      return { ...current, wireframes: nextWireframes, activeWireframeId };
    });
    setSelectedId(null);
  };

  const beginRenameWireframe = (wireframeId: string) => {
    const wireframe = project.wireframes.find((item) => item.id === wireframeId);
    if (!wireframe) return;
    setRenameWireframe({ wireframeId, draft: wireframe.name });
  };

  const commitRenameWireframe = (wireframeId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return false;
    const duplicate = project.wireframes.some((wireframe) => wireframe.id !== wireframeId && wireframe.name.trim().toLowerCase() === nextName.toLowerCase());
    if (duplicate) return false;
    mutateProject((current) => ({
      ...current,
      wireframes: current.wireframes.map((wireframe) => (wireframe.id === wireframeId ? { ...wireframe, name: nextName } : wireframe)),
    }));
    setStatus(`Renamed wireframe to ${nextName}`);
    return true;
  };

  const canvasPointFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - (rect?.left ?? 0)),
      y: Math.round(event.clientY - (rect?.top ?? 0)),
    };
  };

  const openCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (interactiveMode) return;
    const point = canvasPointFromEvent(event);
    const stack = [...(activeWireframe?.nodes ?? [])].filter((node) => pointHitsNode(point.x, point.y, node)).reverse();
    const selected = new Set(selectedIds);
    const selectedTarget = stack.find((node) => selected.has(node.id));
    const targetId = selectedTarget?.id ?? stack[0]?.id ?? null;
    if (targetId && !selected.has(targetId)) setSelectedId(targetId);
    setContextMenu({ x: event.clientX, y: event.clientY, canvasX: point.x, canvasY: point.y, targetId, stack });
  };

  const contextTargetName = contextMenu?.targetId
    ? selectedIds.length > 1 && selectedIds.includes(contextMenu.targetId)
      ? `${selectedIds.length} selected`
      : activeWireframe?.nodes.find((node) => node.id === contextMenu.targetId)?.name ?? "Object"
    : "Canvas";
  const contextActionTargetId = contextMenu?.targetId && selectedIds.includes(contextMenu.targetId) ? null : contextMenu?.targetId ?? null;
  const projectDisplayName = projectPath ? projectNameFromPath(projectPath) : "Unsaved Project";
  const addQuickAccessNode = (definition: ComponentDefinition) => {
    addNode(definition.kind);
    setQuickAccessQuery("");
    setQuickAccessOpen(false);
    setQuickAccessIndex(0);
  };

  const createWireframeForLink = useCallback(() => {
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      wireframes: [...current.wireframes, { id, name: uniqueWireframeName(`Wireframe ${current.wireframes.length + 1}`, current.wireframes), background: "white", showGrid: true, nodes: [] }],
    }));
    return id;
  }, [mutateProject]);

  const duplicateWireframeForLink = useCallback(() => {
    const sourceWireframe = activeWireframe;
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      wireframes: [
        ...current.wireframes,
        {
          id,
          name: uniqueWireframeName(`${sourceWireframe?.name ?? "Wireframe"} copy`, current.wireframes),
          background: wireframeBackground(sourceWireframe),
          showGrid: wireframeShowGrid(sourceWireframe),
          nodes: (sourceWireframe?.nodes ?? []).map((node) => ({ ...node, id: createId("node"), x: node.x + 20, y: node.y + 20 })),
        },
      ],
    }));
    return id;
  }, [activeWireframe, mutateProject]);

  const effectiveRightCollapsed = rightCollapsed || interactiveMode;

  return (
    <div className={interactiveMode ? "app-shell links-active is-interactive" : "app-shell"}>
      <header
        className={appAppearance.accentTitlebar ? "app-titlebar is-accented" : "app-titlebar"}
        data-tauri-drag-region
        onPointerDown={startTitlebarDrag}
      >
        <button
          type="button"
          className="titlebar-pane-toggle"
          title={leftCollapsed ? "Show sidebar" : "Hide sidebar"}
          onClick={() => setLeftCollapsed((v) => !v)}
        >
          {leftCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
        <div className="project-title">
          <span>{projectDisplayName}</span>
          <strong
            className={dirty ? "save-state is-dirty" : "save-state"}
            title={dirty ? "Unsaved changes" : projectPath ? "Saved" : "Not saved"}
            aria-label={dirty ? "Unsaved changes" : projectPath ? "Saved" : "Not saved"}
          />
        </div>
        <div className="titlebar-actions">
          <div className="quick-access" role="combobox" aria-expanded={quickAccessOpen} aria-controls="quick-access-results">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              value={quickAccessQuery}
              placeholder="Quick Access"
              aria-label="Quick Access components"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onFocus={() => setQuickAccessOpen(true)}
              onBlur={() => window.setTimeout(() => setQuickAccessOpen(false), 120)}
              onChange={(event) => {
                setQuickAccessQuery(event.target.value);
                setQuickAccessOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setQuickAccessOpen(true);
                  setQuickAccessIndex((index) => clamp(index + 1, 0, Math.max(quickAccessMatches.length - 1, 0)));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setQuickAccessOpen(true);
                  setQuickAccessIndex((index) => clamp(index - 1, 0, Math.max(quickAccessMatches.length - 1, 0)));
                }
                if (event.key === "Enter") {
                  const definition = quickAccessMatches[quickAccessIndex];
                  if (!definition) return;
                  event.preventDefault();
                  addQuickAccessNode(definition);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuickAccessOpen(false);
                }
              }}
            />
            {quickAccessOpen ? (
              <div className="quick-access-results" id="quick-access-results" role="listbox">
                {quickAccessMatches.length ? (
                  quickAccessMatches.map((definition, index) => {
                    const Icon = componentIcon(definition.icon);
                    return (
                      <button
                        key={definition.kind}
                        type="button"
                        role="option"
                        aria-selected={index === quickAccessIndex}
                        className={index === quickAccessIndex ? "is-active" : ""}
                        onMouseEnter={() => setQuickAccessIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => addQuickAccessNode(definition)}
                      >
                        <Icon size={16} />
                        <span>{definition.label}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="quick-access-empty">No components found</div>
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="titlebar-pane-toggle"
            title="Save project"
            aria-label="Save project"
            onClick={() => void saveProject(false)}
          >
            <Save size={17} />
          </button>
          <button
            type="button"
            className={interactiveMode ? "titlebar-pane-toggle is-active" : "titlebar-pane-toggle"}
            title={interactiveMode ? "Stop interactive mode" : "Play interactive mode"}
            aria-label={interactiveMode ? "Stop interactive mode" : "Play interactive mode"}
            aria-pressed={interactiveMode}
            onClick={() => setInteractiveMode((value) => !value)}
          >
            {interactiveMode ? <Square size={16} /> : <Play size={17} />}
          </button>
          <button
            type="button"
            className="titlebar-pane-toggle"
            title={rightCollapsed ? "Show properties" : "Hide properties"}
            onClick={() => setRightCollapsed((v) => !v)}
          >
            {rightCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
          </button>
        </div>
      </header>

      <main className={`workspace${leftCollapsed ? " left-collapsed" : ""}${effectiveRightCollapsed ? " right-collapsed" : ""}`}>
        <div className="component-library-shell">
          <div className="component-categories" aria-label="Component categories">
            {componentCategories.map((category) => (
              <button
                key={category}
                type="button"
                className={category === activeComponentCategory ? "is-active" : ""}
                onClick={() => setActiveComponentCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="component-library">
            {visibleComponentLibrary.map((definition) => {
              const Icon = componentIcon(definition.icon);
              return (
                <button
                  key={definition.kind}
                  type="button"
                  className="library-item"
                  disabled={interactiveMode}
                  onClick={() => {
                    if (interactiveMode) return;
                    if (suppressNextLibraryClickRef.current) return;
                    addNode(definition.kind);
                  }}
                  onPointerDown={(event) => {
                    if (interactiveMode) return;
                    if (event.button !== 0) return;
                    setPaletteDrag({
                      kind: definition.kind,
                      label: definition.label,
                      x: event.clientX,
                      y: event.clientY,
                      startX: event.clientX,
                      startY: event.clientY,
                      moved: false,
                    });
                  }}
                >
                  <Icon size={26} />
                  <span>{definition.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {leftCollapsed ? null : (
        <aside className="left-pane">
          <div className="pane-header">
            <h2>Wireframes</h2>
            <button type="button" onClick={addWireframe} title="Add wireframe">
              <Plus size={16} />
            </button>
          </div>
          <div
            className="wireframe-list"
            onContextMenu={(event) => {
              if ((event.target as HTMLElement).closest(".wireframe-row")) return;
              event.preventDefault();
              setWireframeContextMenu({ x: event.clientX, y: event.clientY, wireframeId: null });
            }}
          >
            {project.wireframes.map((wireframe) => (
              <button
                key={wireframe.id}
                type="button"
                className={wireframe.id === activeWireframe?.id ? "wireframe-row is-active" : "wireframe-row"}
                onClick={() => selectWireframe(wireframe.id)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectWireframe(wireframe.id);
                  setWireframeContextMenu({ x: event.clientX, y: event.clientY, wireframeId: wireframe.id });
                }}
              >
                <span>{wireframe.name}</span>
                <small>{wireframe.nodes.length}</small>
              </button>
            ))}
          </div>
          <div className="wireframe-actions">
            <button type="button" onClick={() => duplicateWireframe()}>Duplicate</button>
            <button type="button" onClick={() => deleteWireframe()} disabled={project.wireframes.length === 1}>Delete</button>
          </div>
        </aside>
        )}

        <section className="center-pane">
          <div
            className={`canvas-scroll canvas-bg-${activeWireframeBackground}${activeWireframeShowGrid ? " has-grid" : ""}`}
          >
            <div
              ref={canvasRef}
              className="canvas"
              onPointerDown={(event) => {
                if (interactiveMode) return;
                if (event.button !== 0 || event.target !== event.currentTarget) return;
                const point = canvasPointFromEvent(event);
                setContextMenu(null);
                closeTextEditor(true);
                setSelectionRect({
                  startX: point.x,
                  startY: point.y,
                  currentX: point.x,
                  currentY: point.y,
                  additive: event.shiftKey || event.metaKey || event.ctrlKey,
                  moved: false,
                });
              }}
              onClick={(event) => {
                if (suppressCanvasClickRef.current) {
                  event.preventDefault();
                  return;
                }
                if (selectionRect?.moved) return;
                if (event.target === event.currentTarget && !event.shiftKey && !event.metaKey && !event.ctrlKey) setSelectedId(null);
                setContextMenu(null);
                closeTextEditor(true);
              }}
              onContextMenu={openCanvasContextMenu}
            >
              {snapGuides.map((x, index) => (
                <div key={`guide-${index}-${x}`} className="snap-guide" style={{ left: x }} />
              ))}
              {selectionRect?.moved ? (
                <div
                  className="selection-marquee"
                  style={{
                    left: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).x,
                    top: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).y,
                    width: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).width,
                    height: rectFromPoints(selectionRect.startX, selectionRect.startY, selectionRect.currentX, selectionRect.currentY).height,
                  }}
                />
              ) : null}
              {activeWireframe?.nodes.map((node) => (
                <CanvasItem
                  key={node.id}
                  node={node}
                  selected={selectedIds.includes(node.id)}
                  primarySelected={node.id === selectedId}
                  linksActive={interactiveMode}
                  editingLocked={interactiveMode}
                  interactiveSelect={interactiveSelect?.nodeId === node.id ? interactiveSelect : null}
                  onSelect={(additive) => {
                    if (additive) toggleSelection(node.id);
                    else setSelectedId(node.id);
                  }}
                  onLinkClick={(key) => followNodeLink(node, key)}
                  onInteractiveSelect={() => toggleInteractiveSelect(node)}
                  onInteractiveOptionSelect={(index) => {
                    setInteractiveSelect({ nodeId: node.id, selectedIndex: index, open: false });
                  }}
                  onTextEdit={() => beginTextEdit(node)}
                  onMoveStart={(event) => {
                    if (interactiveMode) return;
                    if (node.locked) return;
                    event.stopPropagation();
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      toggleSelection(node.id);
                      return;
                    }
                    const nodeIds = selectedIds.includes(node.id) ? selectedIds : [node.id];
                    if (!selectedIds.includes(node.id)) setSelectedId(node.id);
                    const movingNodes = activeWireframe?.nodes.filter((item) => nodeIds.includes(item.id) && !item.locked) ?? [];
                    setDragState({
                      kind: "move",
                      nodeIds: movingNodes.map((item) => item.id),
                      startX: event.clientX,
                      startY: event.clientY,
                      originalPositions: Object.fromEntries(movingNodes.map((item) => [item.id, { x: item.x, y: item.y }])),
                      currentX: node.x,
                      currentY: node.y,
                    });
                  }}
                  onResizeStart={(event, handle) => {
                    if (interactiveMode) return;
                    event.stopPropagation();
                    setSelectedId(node.id);
                    setDragState({
                      kind: "resize",
                      nodeId: node.id,
                      handle,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalX: node.x,
                      originalY: node.y,
                      originalWidth: node.width,
                      originalHeight: node.height,
                      currentX: node.x,
                      currentY: node.y,
                      currentWidth: node.width,
                      currentHeight: node.height,
                    });
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {effectiveRightCollapsed ? null : (
          <aside className="right-pane">
            <PropertiesPane
              selectedNode={selectedNode}
              selectedCount={selectedIds.length}
              activeWireframe={activeWireframe}
              onWireframeChange={updateActiveWireframe}
              onNodeChange={(patch, options) => selectedNode && updateNode(selectedNode.id, patch, options)}
              onNodeChangeEnd={endProjectHistoryGroup}
              onLayer={(action) => layerNode(null, action)}
              projectWireframes={project.wireframes}
              onCreateWireframeForLink={createWireframeForLink}
              onDuplicateWireframeForLink={duplicateWireframeForLink}
            />
          </aside>
        )}
      </main>

      <footer className="statusbar">
        <span>{projectPath ?? "Unsaved project"}</span>
        <span>{status}</span>
      </footer>

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          targetName={contextTargetName}
          canPaste={true}
          onClose={() => setContextMenu(null)}
          onSelect={(id) => {
            setSelectedId(id);
            setContextMenu((current) => (current ? { ...current, targetId: id } : current));
          }}
          onCut={() => cutNode(contextActionTargetId)}
          onCopy={() => copyNode(contextActionTargetId)}
          onPaste={() => pasteNode(contextMenu.canvasX, contextMenu.canvasY)}
          onDelete={() => deleteNode(contextActionTargetId)}
          onLayer={(action) => layerNode(contextActionTargetId, action)}
        />
      ) : null}
      {wireframeContextMenu ? (
        <WireframeContextMenu
          state={wireframeContextMenu}
          canDelete={Boolean(wireframeContextMenu.wireframeId) && project.wireframes.length > 1}
          canDuplicate={Boolean(wireframeContextMenu.wireframeId)}
          canRename={Boolean(wireframeContextMenu.wireframeId)}
          onClose={() => setWireframeContextMenu(null)}
          onNew={addWireframe}
          onRename={() => wireframeContextMenu.wireframeId && beginRenameWireframe(wireframeContextMenu.wireframeId)}
          onDuplicate={() => wireframeContextMenu.wireframeId && duplicateWireframe(wireframeContextMenu.wireframeId)}
          onDelete={() => wireframeContextMenu.wireframeId && deleteWireframe(wireframeContextMenu.wireframeId)}
        />
      ) : null}
      {renameWireframe ? (
        <RenameWireframeDialog
          state={renameWireframe}
          wireframes={project.wireframes}
          onChange={(draft) => setRenameWireframe((current) => (current ? { ...current, draft } : current))}
          onCancel={() => setRenameWireframe(null)}
          onSave={() => {
            if (!commitRenameWireframe(renameWireframe.wireframeId, renameWireframe.draft)) return false;
            setRenameWireframe(null);
            return true;
          }}
        />
      ) : null}
      {paletteDrag?.moved ? (
        <div className="palette-drag-preview" style={{ left: paletteDrag.x, top: paletteDrag.y }}>
          {paletteDrag.label}
        </div>
      ) : null}
      {textEditor ? (
        <FloatingTextEditor
          editor={textEditor}
          onChange={(draft) => {
            setTextEditor((current) => {
              if (!current) return current;
              const nextEditor = { ...current, draft };
              textEditorRef.current = nextEditor;
              return nextEditor;
            });
          }}
          onCommit={(draft) => closeTextEditor(true, draft)}
          onCancel={() => closeTextEditor(false)}
        />
      ) : null}
      {saveToast ? <div className="save-toast">{saveToast}</div> : null}
      {settingsOpen ? (
        <SettingsDialog
          appAppearance={appAppearance}
          onAppearanceChange={(appearance) => setAppAppearance((current) => ({ ...current, ...appearance }))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {closePromptOpen ? (
        <UnsavedChangesDialog
          projectName={projectDisplayName}
          onCancel={() => setClosePromptOpen(false)}
          onDiscard={() => {
            setClosePromptOpen(false);
            void closeWindow();
          }}
          onSave={async () => {
            const saved = await saveProject(false);
            if (!saved) return;
            setClosePromptOpen(false);
            await closeWindow();
          }}
        />
      ) : null}
    </div>
  );
}

function CanvasItem({
  node,
  selected,
  primarySelected,
  linksActive,
  editingLocked,
  interactiveSelect,
  onSelect,
  onLinkClick,
  onInteractiveSelect,
  onInteractiveOptionSelect,
  onTextEdit,
  onMoveStart,
  onResizeStart,
}: {
  node: CanvasNode;
  selected: boolean;
  primarySelected: boolean;
  linksActive: boolean;
  editingLocked: boolean;
  interactiveSelect: InteractiveSelectState | null;
  onSelect: (additive: boolean) => void;
  onLinkClick: (key: string) => void;
  onInteractiveSelect: () => void;
  onInteractiveOptionSelect: (index: number) => void;
  onTextEdit: () => void;
  onMoveStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent, handle: ResizeHandle) => void;
}) {
  const style = {
    left: node.x,
    top: node.y,
    width: node.width,
    height: node.height,
    "--node-fill": node.fill ?? "#ffffff",
    "--node-stroke": node.stroke ?? "#111827",
    "--node-text": node.textColor ?? "#111827",
    "--node-font-size": `${node.fontSize ?? 14}px`,
    opacity: (node.opacity ?? 100) / 100,
  } as React.CSSProperties;

  return (
    <div
      className={`canvas-node node-${node.kind}${selected ? " is-selected" : ""}${primarySelected ? " is-primary-selected" : ""}${node.locked ? " is-locked" : ""}`}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          event.preventDefault();
          return;
        }
        if (editingLocked) {
          if (linksActive && (event.target as HTMLElement).closest("[data-link-key]")) event.stopPropagation();
          return;
        }
        if (linksActive && selected && (event.target as HTMLElement).closest("[data-link-key]")) {
          event.stopPropagation();
          return;
        }
        onMoveStart(event);
      }}
      onClick={(event) => {
        event.stopPropagation();
        const linkTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-link-key]");
        const accordionTarget = (event.target as HTMLElement).closest<HTMLElement>("[data-accordion-index]");
        if (editingLocked && node.kind === "accordion" && accordionTarget) {
          const nextIndex = Number(accordionTarget.dataset.accordionIndex);
          if (Number.isFinite(nextIndex)) onInteractiveOptionSelect(nextIndex);
          if (linksActive && linkTarget) onLinkClick(linkTarget.dataset.linkKey ?? "whole");
          return;
        }
        if (linksActive && linkTarget) {
          onLinkClick(linkTarget.dataset.linkKey ?? "whole");
          return;
        }
        if (editingLocked && (node.kind === "dropdown" || node.kind === "comboBox")) {
          onInteractiveSelect();
          return;
        }
        if (editingLocked) return;
        if (event.shiftKey || event.metaKey || event.ctrlKey) return;
        onSelect(event.shiftKey || event.metaKey || event.ctrlKey);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (editingLocked) return;
        onTextEdit();
      }}
    >
      <div className="canvas-node-clip">
        <NodeContent node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={interactiveSelect?.selectedIndex ?? null} />
      </div>
      {interactiveSelect?.open && (node.kind === "dropdown" || node.kind === "comboBox") ? (
        <div className="interactive-select-menu" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          {nodeOptions(node, ["First", "Second", "Third"]).map((option, index) => (
            <button key={`${option}-${index}`} type="button" className={index === interactiveSelect.selectedIndex ? "is-selected" : ""} onClick={() => onInteractiveOptionSelect(index)}>
              {renderInlineFormatting(option)}
            </button>
          ))}
        </div>
      ) : null}
      {primarySelected && !editingLocked ? (
        <>
          {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as ResizeHandle[]).map((handle) => (
            <span
              key={handle}
              className={`selection-handle handle-${handle}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                if (event.button !== 0) return;
                onResizeStart(event, handle);
              }}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function nodeOptions(node: CanvasNode, fallback: string[] = []) {
  return node.options?.length ? node.options : fallback;
}

function nodePercent(node: CanvasNode, fallback = 45) {
  const value = Number(node.value ?? fallback);
  return clamp(Number.isFinite(value) ? value : fallback, 0, 100);
}

type CheckboxListRow =
  | { kind: "checkbox"; checked: boolean; indeterminate: boolean; disabled: boolean; text: string }
  | { kind: "text"; text: string };

type AccordionSection = {
  title: string;
  optionIndex: number;
  children: { text: string; optionIndex: number; raw: string }[];
  raw: string;
};

function parseCheckboxListRow(row: string): CheckboxListRow {
  const disabledMatch = row.match(/^-\[( |x|X|-)\]\s*(.*)-$/);
  const enabledMatch = row.match(/^\[( |x|X|-)\]\s*(.*)$/);
  const match = disabledMatch ?? enabledMatch;
  if (!match) return { kind: "text", text: row };
  const marker = match[1].toLowerCase();
  return {
    kind: "checkbox",
    checked: marker === "x",
    indeterminate: marker === "-",
    disabled: Boolean(disabledMatch),
    text: match[2],
  };
}

function parseAccordionSections(node: CanvasNode): AccordionSection[] {
  const sections: AccordionSection[] = [];
  nodeOptions(node, ["Item One", "Item Two", "Item Three", "Item Four"]).forEach((raw, optionIndex) => {
    const childMatch = raw.match(/^\s*-\s*(.*)$/);
    if (childMatch && sections.length) {
      sections[sections.length - 1].children.push({ text: childMatch[1] || raw.trim(), optionIndex, raw });
      return;
    }
    sections.push({ title: raw, optionIndex, children: [], raw });
  });
  return sections;
}

function accordionOpenIndex(node: CanvasNode, selectedOptionIndex?: number | null) {
  const sections = parseAccordionSections(node);
  if (!sections.length) return -1;
  const requestedIndex = typeof selectedOptionIndex === "number" ? selectedOptionIndex : node.activeIndex;
  const matchingSection = sections.find((section) => section.optionIndex === requestedIndex);
  return matchingSection?.optionIndex ?? sections[0].optionIndex;
}

function alertTextParts(node: CanvasNode) {
  const lines = (node.text ?? "Alert\nAlert text goes here").split("\n");
  const title = lines[0]?.trim() || "Alert";
  const message = lines.slice(1).join("\n").trim() || "Alert text goes here";
  return { title, message };
}

function iconNameFromMarkdown(name: string) {
  return name
    .split("-")
    .filter((part) => part && part !== "solid")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

type InlineMarkdownOptions = {
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  links?: boolean;
};

function renderInlineMarkdown(text: string, options: InlineMarkdownOptions = {}): React.ReactNode[] {
  const { selected = false, linksActive = false, onLinkClick, links = true } = options;
  const nodes: React.ReactNode[] = [];
  const pattern = /(\{color:([^}]+)\}([\s\S]*?)\{color\}|\[([^\]]+)\]|:([a-z0-9-]+):|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|<u>([\s\S]*?)<\/u>|&([^&\n]+)&|~~([^~\n]+)~~|~([^~\n]+)~)/gi;
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `md-${index++}`;
    if (match[2] && match[3]) nodes.push(<span key={key} style={{ color: match[2] }}>{match[3]}</span>);
    else if (match[4]) {
      const linkKey = `text:${linkKeyFromLabel(match[4], "link")}`;
      if (links) {
        nodes.push(
          <span
            key={key}
            className="mock-link"
            data-link-key={linkKey}
            onPointerDown={(event) => {
              if (linksActive && selected && onLinkClick) event.stopPropagation();
            }}
          >
            {match[4]}
          </span>,
        );
      } else {
        nodes.push(match[0]);
      }
    }
    else if (match[5]) {
      const Icon = getLucideIcon(iconNameFromMarkdown(match[5]));
      nodes.push(<Icon key={key} className="inline-markdown-icon" size="1em" />);
    } else if (match[6]) nodes.push(<strong key={key}>{match[6]}</strong>);
    else if (match[7]) nodes.push(<em key={key}>{match[7]}</em>);
    else if (match[8]) nodes.push(<em key={key}>{match[8]}</em>);
    else if (match[9]) nodes.push(<u key={key}>{match[9]}</u>);
    else if (match[10]) nodes.push(<u key={key}>{match[10]}</u>);
    else if (match[11]) nodes.push(<s key={key}>{match[11]}</s>);
    else if (match[12]) nodes.push(<s key={key}>{match[12]}</s>);
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderInlineFormatting(text: string): React.ReactNode[] {
  return renderInlineMarkdown(text, { links: false });
}

function extractMarkdownLinks(text: string) {
  const names = [...text.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim()).filter(Boolean);
  return [...new Set(names)];
}

function NodeContent({
  node,
  selected = false,
  linksActive = false,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  if (["button", "circleButton", "pointyButton", "multilineButton", "helpButton"].includes(node.kind)) return <ButtonVisual node={node} />;
  if (["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link", "squigglyParagraph"].includes(node.kind)) return <TextVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["checkbox", "checkboxList", "radioButton", "radioButtonGroup", "dropdown", "comboBox", "textbox", "textInput", "textArea", "searchBox", "searchBoxVoice", "colorPicker", "numericStepper", "onOffSwitch", "progressBar", "progressBarIndeterminate"].includes(node.kind)) {
    return <FormVisual node={node} selectedOptionIndex={selectedOptionIndex} />;
  }
  if (["tabs", "buttonBar", "tabBar", "vTabs", "linkBar", "breadcrumbs", "menuBar", "menu", "appBar", "playback", "toolbar"].includes(node.kind)) return <NavigationVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["accordion", "alertBox", "alertBoxAndroid", "browser", "window", "modalScreen", "fieldSet", "popover", "tooltip", "callout"].includes(node.kind)) return <ContainerVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={selectedOptionIndex} />;
  if (["list", "listIcon", "treePane", "dataGrid", "calendar", "dateChooser", "datePicker", "timePicker", "siteMap", "streetMap", "tagCloud"].includes(node.kind)) return <DataVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (["chartBar", "chartColumn", "chartLine", "chartPie", "hScrollBar", "vScrollBar", "hSlider", "vSlider", "volumeSlider"].includes(node.kind)) return <ChartVisual node={node} />;
  if (["arrow", "hRule", "vRule", "hSplitter", "vSplitter", "redX", "scratchOut", "squigglyLine", "hCurlyBrace", "vCurlyBrace", "shape"].includes(node.kind)) return <MarkupVisual node={node} />;
  if (["icon", "iconText", "image", "webcam", "videoPlayer", "coverFlow", "smartphone", "iphone", "ipad", "iosKeyboard", "iosMenu", "iosPicker"].includes(node.kind)) return <MediaVisual node={node} />;
  if (node.kind === "stickyNote") return <div className="editable-node-text">{renderInlineFormatting(node.text ?? "")}</div>;
  return null;
}

function ButtonVisual({ node }: { node: CanvasNode }) {
  const className = `button-node visual-button visual-button-${node.kind}`;
  return (
    <div className={className} data-link-key="whole">
      <span>{renderInlineFormatting(node.text ?? "")}</span>
    </div>
  );
}

function TextVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  const text = node.text ?? "";
  const textAlign = node.textAlign ?? "left";
  const textClassName = [
    "editable-node-text",
    "text-visual",
    `text-visual-${node.kind}`,
    `text-align-${textAlign}`,
    node.textBold ? "text-format-bold" : "",
    node.textItalic ? "text-format-italic" : "",
    (node.textUnderline ?? node.kind === "link") ? "text-format-underline" : "",
  ].filter(Boolean).join(" ");
  if (node.kind === "squigglyParagraph") {
    return (
      <div className="squiggle-paragraph">
        <span />
        <span />
        <span />
        <span />
      </div>
    );
  }
  if (node.kind === "textParagraph") {
    return (
      <div className={textClassName}>
        {text.split("\n").map((line, index) => (
          <span key={`${line}-${index}`} className="markdown-line">
            {renderInlineMarkdown(line, { selected, linksActive, onLinkClick })}
          </span>
        ))}
      </div>
    );
  }
  return <div className={textClassName} data-link-key="whole">{renderInlineMarkdown(text, { selected, linksActive, onLinkClick })}</div>;
}

function FormVisual({ node, selectedOptionIndex }: { node: CanvasNode; selectedOptionIndex?: number | null }) {
  if (node.kind === "checkbox") {
    return (
      <label className="checkbox-node">
        <span className={node.checked ? "mock-checkbox is-checked" : "mock-checkbox"} />
        <span>{renderInlineFormatting(node.text ?? "")}</span>
      </label>
    );
  }
  if (node.kind === "radioButton") {
    return (
      <label className="radio-node">
        <span className={node.checked ? "radio-dot is-checked" : "radio-dot"} />
        <span>{renderInlineFormatting(node.text ?? "")}</span>
      </label>
    );
  }
  if (node.kind === "checkboxList" || node.kind === "radioButtonGroup") {
    return (
      <div className="checkbox-list-node">
        {nodeOptions(node, ["Option one", "Option two", "Option three"]).map((option, index) => {
          const checkboxRow = parseCheckboxListRow(option);
          return (
            <div key={`${option}-${index}`} className={checkboxRow.kind === "checkbox" && checkboxRow.disabled ? "is-disabled" : ""}>
              {node.kind === "radioButtonGroup" ? <span className={index === 0 ? "radio-dot is-checked" : "radio-dot"} /> : null}
              {node.kind === "checkboxList" && checkboxRow.kind === "checkbox" ? (
                <span className={`mock-checkbox${checkboxRow.checked ? " is-checked" : ""}${checkboxRow.indeterminate ? " is-indeterminate" : ""}`} />
              ) : null}
              <span>{renderInlineFormatting(checkboxRow.text)}</span>
            </div>
          );
        })}
      </div>
    );
  }
  if (node.kind === "dropdown" || node.kind === "comboBox") {
    const selectedOption = typeof selectedOptionIndex === "number" ? nodeOptions(node)[selectedOptionIndex] : null;
    return (
      <div className="dropdown-node">
        <span>{renderInlineFormatting(selectedOption ?? node.text ?? "")}</span>
        <ChevronDown size={16} />
      </div>
    );
  }
  if (node.kind === "textbox" || node.kind === "textInput") return <div className="textbox-node">{renderInlineFormatting(node.text || node.placeholder || "")}</div>;
  if (node.kind === "textArea") return <div className="textarea-node">{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "searchBox" || node.kind === "searchBoxVoice") {
    return (
      <div className="search-node">
        <Search size={14} />
        <span>{renderInlineFormatting(node.text || node.placeholder || "")}</span>
        {node.kind === "searchBoxVoice" ? <span className="mic-dot" /> : null}
      </div>
    );
  }
  if (node.kind === "colorPicker") return <div className="color-picker-node"><span /></div>;
  if (node.kind === "numericStepper") return <div className="stepper-node"><strong>{node.value ?? 3}</strong><span>▲</span><span>▼</span></div>;
  if (node.kind === "onOffSwitch") return <div className={node.checked ? "switch-node is-on" : "switch-node"}><span /></div>;
  if (node.kind === "progressBar" || node.kind === "progressBarIndeterminate") {
    return <div className="progress-node"><span style={{ width: node.kind === "progressBarIndeterminate" ? "28%" : `${nodePercent(node)}%` }} /></div>;
  }
  return null;
}

function LinkedVisualItem({
  linkKey,
  selected,
  linksActive,
  onLinkClick,
  className,
  children,
}: {
  linkKey: string;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={className}
      data-link-key={linkKey}
      onPointerDown={(event) => {
        if (linksActive && selected && onLinkClick) event.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

function NavigationVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  if (isTabsNode(node)) return <TabsVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "buttonBar") {
    const items = nodeOptions(node);
    const activeIndex = items.length ? clamp(node.activeIndex ?? 0, 0, items.length - 1) : -1;
    return <Segmented items={items} activeIndex={activeIndex} compact selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  }
  if (node.kind === "vTabs") return <div className="v-tabs-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} className={index === (node.activeIndex ?? 0) ? "is-active" : ""}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "linkBar" || node.kind === "breadcrumbs") {
    return (
      <div className={`linkbar-node ${node.kind}`}>
        {nodeOptions(node).map((item, index) => (
          <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>
            {node.kind === "breadcrumbs" ? <span className="breadcrumb-label">{renderInlineFormatting(item)}</span> : renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
    );
  }
  if (node.kind === "menuBar") return <div className="menu-bar-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "menu") return <div className="menu-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  if (node.kind === "appBar") return <div className="app-bar-node"><span>{renderInlineFormatting(node.text ?? "")}</span><small>▾</small></div>;
  if (node.kind === "playback") return <div className="playback-node"><span>◀◀</span><span>▶</span><span>▶▶</span></div>;
  if (node.kind === "toolbar") return <div className="toolbar-node">{nodeOptions(node).map((item, index) => <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>{renderInlineFormatting(item)}</LinkedVisualItem>)}</div>;
  return null;
}

function TabsVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  const items = nodeOptions(node, ["One", "Two", "Three", "Four"]);
  const activeIndex = clamp(node.activeIndex ?? -1, -1, items.length - 1);
  const placement = node.tabPlacement ?? "top";
  const alignment = node.tabAlignment ?? "left";
  return (
    <div className={`tabs-node tabs-${placement} tabs-align-${alignment}${node.showBorder === false ? " no-border" : " has-border"}${node.showScrollbar ? " has-scrollbar" : ""}${node.textBold ? " tabs-text-bold" : ""}${node.textItalic ? " tabs-text-italic" : ""}${node.textUnderline ? " tabs-text-underline" : ""}`}>
      <div className="tabs-strip">
        {items.map((item, index) => (
          <LinkedVisualItem
            key={`${item}-${index}`}
            linkKey={linkKeyForIndex("item", item, index)}
            selected={selected}
            linksActive={linksActive}
            onLinkClick={onLinkClick}
            className={`tabs-tab${index === activeIndex ? " is-active" : ""}`}
          >
            {renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
      <div className="tabs-panel">
        {node.showScrollbar ? <span className="tabs-scrollbar" /> : null}
      </div>
    </div>
  );
}

function ContainerVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  if (node.kind === "accordion") return <AccordionVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} selectedOptionIndex={selectedOptionIndex} />;
  if (node.kind === "alertBox" || node.kind === "alertBoxAndroid") return <AlertVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "browser" || node.kind === "window") return <ChromeFrame node={node} />;
  if (node.kind === "modalScreen") return <div className="modal-screen-node" />;
  if (node.kind === "fieldSet") return <fieldset className="fieldset-node"><legend>{renderInlineFormatting(node.text ?? "")}</legend></fieldset>;
  if (node.kind === "popover") return <div className="popover-node"><span />{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "tooltip") return <div className="tooltip-node">{renderInlineFormatting(node.text ?? "")}</div>;
  if (node.kind === "callout") return <div className="callout-node">{renderInlineFormatting(node.text ?? "")}</div>;
  return null;
}

function AccordionVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
  selectedOptionIndex,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
  selectedOptionIndex?: number | null;
}) {
  const sections = parseAccordionSections(node);
  const openIndex = accordionOpenIndex(node, selectedOptionIndex);
  const className = [
    "accordion-node",
    node.showScrollbar ? "has-scrollbar" : "",
    node.textBold ? "accordion-text-bold" : "",
    node.textItalic ? "accordion-text-italic" : "",
    node.textUnderline ? "accordion-text-underline" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      {sections.map((section) => {
        const isOpen = section.optionIndex === openIndex;
        return (
          <div key={`${section.raw}-${section.optionIndex}`} className={isOpen ? "accordion-section is-open" : "accordion-section"}>
            <span
              className="accordion-header"
              data-accordion-index={section.optionIndex}
              data-link-key={linkKeyForIndex("item", section.raw, section.optionIndex)}
              onPointerDown={(event) => {
                if (linksActive && selected && onLinkClick) event.stopPropagation();
              }}
            >
              {renderInlineFormatting(section.title)}
            </span>
            {isOpen ? (
              <div className="accordion-panel">
                {section.children.map((child) => (
                  <span
                    key={`${child.raw}-${child.optionIndex}`}
                    className="accordion-child"
                    data-link-key={linkKeyForIndex("item", child.raw, child.optionIndex)}
                    onPointerDown={(event) => {
                      if (linksActive && selected && onLinkClick) event.stopPropagation();
                    }}
                  >
                    {renderInlineFormatting(child.text)}
                  </span>
                ))}
                {node.showScrollbar ? <span className="accordion-scrollbar" /> : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function AlertVisual({
  node,
  selected,
  linksActive,
  onLinkClick,
}: {
  node: CanvasNode;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
}) {
  const { title, message } = alertTextParts(node);
  const buttons = nodeOptions(node, ["No", "Yes"]);
  const align = node.textAlign ?? (node.kind === "alertBox" ? "center" : "left");
  const className = [
    "alert-node",
    node.kind === "alertBoxAndroid" ? "alert-android" : "alert-standard",
    node.showBorder === false ? "no-border" : "",
    `text-align-${align}`,
    node.textBold ? "alert-text-bold" : "",
    node.textItalic ? "alert-text-italic" : "",
    node.textUnderline ? "alert-text-underline" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <div className="alert-content">
        <strong>{renderInlineFormatting(title)}</strong>
        <p>{renderInlineFormatting(message)}</p>
      </div>
      <div className="alert-buttons">
        {buttons.map((item, index) => (
          <span
            key={`${item}-${index}`}
            data-link-key={linkKeyForIndex("item", item, index)}
            onPointerDown={(event) => {
              if (linksActive && selected && onLinkClick) event.stopPropagation();
            }}
          >
            {renderInlineFormatting(item || `Button ${index + 1}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChromeFrame({ node }: { node: CanvasNode }) {
  return (
    <div className="chrome-frame-node">
      <div><span /><span /><span /><strong>{renderInlineFormatting(node.text ?? "")}</strong></div>
      <section />
    </div>
  );
}

function DataVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  if (node.kind === "treePane") return <TreePaneVisual node={node} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick} />;
  if (node.kind === "list" || node.kind === "listIcon") {
    return (
      <div className={`list-node ${node.kind}`}>
        {nodeOptions(node).map((item, index) => (
          <LinkedVisualItem key={`${item}-${index}`} linkKey={linkKeyForIndex("item", item, index)} selected={selected} linksActive={linksActive} onLinkClick={onLinkClick}>
            {node.kind === "listIcon" ? "◆ " : ""}
            {renderInlineFormatting(item)}
          </LinkedVisualItem>
        ))}
      </div>
    );
  }
  if (node.kind === "dataGrid") return <DataGridVisual node={node} />;
  if (node.kind === "calendar" || node.kind === "datePicker") return <CalendarVisual node={node} />;
  if (node.kind === "dateChooser") return <div className="date-chooser-node">{renderInlineFormatting(node.text ?? "")}<span>▣</span></div>;
  if (node.kind === "timePicker") return <div className="time-picker-node"><span>{renderInlineFormatting(node.text ?? "")}</span><i /></div>;
  if (node.kind === "siteMap") return <SiteMapVisual node={node} />;
  if (node.kind === "streetMap") return <div className="street-map-node"><span /><span /><span /></div>;
  if (node.kind === "tagCloud") return <div className="tag-cloud-node">{(node.text ?? "").split(/\s+/).map((word, index) => <span key={`${word}-${index}`}>{renderInlineFormatting(word)}</span>)}</div>;
  return null;
}

type TreePaneRow = {
  key: string;
  depth: number;
  icon: "folder-closed" | "folder-open" | "plus" | "minus" | "checked" | "empty" | "chevron-right" | "chevron-down" | "file" | "none";
  label: string;
};

function parseTreePaneRows(node: CanvasNode): TreePaneRow[] {
  return nodeOptions(node).map((rawRow, index) => {
    const line = rawRow.replace(/\t/g, "  ");
    const leading = line.match(/^[ .]*/)?.[0] ?? "";
    const depth = Math.floor([...leading].reduce((sum, char) => sum + (char === "." ? 1 : 0.5), 0));
    const trimmed = line.slice(leading.length);
    const markerMatch = trimmed.match(/^(\[\+\]|\[-\]|\[x\]|\[X\]|\[\s\]|[fFv>\-_▸▾])(?:\s+|$)/);
    const marker = markerMatch?.[1] ?? "_";
    const label = markerMatch ? trimmed.slice(markerMatch[0].length).trimStart() : trimmed.trimStart();
    const iconByMarker: Record<string, TreePaneRow["icon"]> = {
      f: "folder-closed",
      F: "folder-open",
      "[+]": "plus",
      "[-]": "minus",
      "[x]": "checked",
      "[X]": "checked",
      "[ ]": "empty",
      ">": "chevron-right",
      "v": "chevron-down",
      "▸": "chevron-right",
      "▾": "chevron-down",
      "-": "file",
      _: "none",
    };
    return {
      key: linkKeyForIndex("tree", label || trimmed || rawRow, index),
      depth,
      icon: iconByMarker[marker] ?? "none",
      label,
    };
  });
}

function TreePaneVisual({ node, selected, linksActive, onLinkClick }: { node: CanvasNode; selected?: boolean; linksActive?: boolean; onLinkClick?: (key: string) => void }) {
  return (
    <div className="tree-pane-node">
      {parseTreePaneRows(node).map((row) => (
        <span
          key={row.key}
          className="tree-pane-row"
          data-link-key={row.key}
          style={{ "--tree-depth": row.depth } as React.CSSProperties}
          onPointerDown={(event) => {
            if (linksActive && selected && onLinkClick) event.stopPropagation();
          }}
        >
          <TreePaneIcon icon={row.icon} />
          <span className="tree-pane-label">{renderInlineFormatting(row.label)}</span>
        </span>
      ))}
    </div>
  );
}

function TreePaneIcon({ icon }: { icon: TreePaneRow["icon"] }) {
  if (icon === "none") return <span className="tree-pane-icon tree-pane-icon-none" aria-hidden="true" />;
  const iconNames: Record<Exclude<TreePaneRow["icon"], "none">, string> = {
    "folder-closed": "Folder",
    "folder-open": "FolderOpen",
    plus: "SquarePlus",
    minus: "SquareMinus",
    checked: "SquareCheckBig",
    empty: "Square",
    "chevron-right": "ChevronRight",
    "chevron-down": "ChevronDown",
    file: "FileText",
  };
  const Icon = getLucideIcon(iconNames[icon]);
  return (
    <span className="tree-pane-icon" aria-hidden="true">
      <Icon size="1.12em" strokeWidth={2.6} />
    </span>
  );
}

function DataGridVisual({ node }: { node: CanvasNode }) {
  const grid = parseDataGrid(node);
  const blankRows = createDataGridBlankRows(node, grid);
  return (
    <table className="data-grid-node">
      <colgroup>
        {grid.columns.map((column, index) => (
          <col key={`${column.text}-${index}`} style={{ width: column.width }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {grid.columns.map((column, index) => (
            <th key={`${column.text}-${index}`} style={{ textAlign: column.align }}>
              <DataGridCell cell={column.text} />
              {column.sort ? (
                <span
                  className={`data-grid-sort ${column.sort === "▲" ? "is-ascending" : column.sort === "▼" ? "is-descending" : "is-both"}`}
                  aria-label={column.sort === "▲" ? "ascending" : column.sort === "▼" ? "descending" : "ascending and descending"}
                />
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row, rowIndex) => (
          <tr key={`${row.join("|")}-${rowIndex}`}>
            {grid.columns.map((column, index) => (
              <td key={index} className={parseDataGridControl((row[index] ?? "").trim()) ? "is-control-cell" : ""} style={{ textAlign: column.align }}>
                <DataGridCell cell={row[index] ?? ""} />
              </td>
            ))}
          </tr>
        ))}
        {blankRows.map((row) => (
          <tr key={row}>
            {grid.columns.map((column, index) => (
              <td key={index} style={{ textAlign: column.align }}>
                <span className="data-grid-cell-line" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ParsedDataGridColumn = {
  text: string;
  align?: "left" | "center" | "right";
  sort?: string;
  width?: string;
};

function parseDataGrid(node: CanvasNode): { columns: ParsedDataGridColumn[]; rows: string[][] } {
  const source = node.text?.trim()
    ? node.text
    : [
        (node.columns?.length ? node.columns : ["Name", "Role", "Status"]).join(", "),
        ...(node.rows?.length ? node.rows.map((row) => row.split("|").join(", ")) : ["Alice, PM, Active", "Ben, Design, Review"]),
      ].join("\n");
  const lines = source.split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  const specMatch = lines.at(-1)?.trim().match(/^\{(.+)\}$/);
  const columnSpecs = specMatch ? parseDataGridColumnSpecs(specMatch[1]) : [];
  const dataLines = specMatch ? lines.slice(0, -1) : lines;
  const [headerLine = "Column 1, Column 2", ...bodyLines] = dataLines;
  const headerCells = parseDelimitedRow(headerLine);
  const columns = headerCells.map((cell, index) => {
    const { text, sort } = parseHeaderCell(cell);
    const spec = columnSpecs[index];
    return {
      text,
      sort,
      align: spec?.align,
      width: spec?.width,
    };
  });
  const rows = bodyLines.map((line) => parseDelimitedRow(line));
  return { columns, rows };
}

function parseDelimitedRow(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : ",";
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") {
      const nextChar = line[index + 1];
      if (nextChar === delimiter) {
        current += nextChar;
        index += 1;
        continue;
      }
      current += char;
      continue;
    }
    if (char === delimiter) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseDataGridColumnSpecs(spec: string): Array<{ align?: "left" | "center" | "right"; width?: string }> {
  const parts = parseDelimitedRow(spec);
  const numericParts = parts.map((part) => Number(part.match(/\d+/)?.[0] ?? 1));
  const positiveTotal = numericParts.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const flexibleColumnCount = numericParts.filter((value) => value === 0).length;
  const flexibleColumnWidth = flexibleColumnCount ? Math.min(18, 100 / numericParts.length) : 0;
  const weightedColumnWidth = Math.max(0, 100 - flexibleColumnWidth * flexibleColumnCount);
  return parts.map((part, index) => {
    const alignCode = part.match(/[LCR]\s*$/i)?.[0].trim().toUpperCase();
    const numericValue = numericParts[index];
    const width = numericValue === 0
      ? `${flexibleColumnWidth}%`
      : positiveTotal
        ? `${(numericValue / positiveTotal) * weightedColumnWidth}%`
        : `${100 / numericParts.length}%`;
    return {
      align: alignCode === "R" ? "right" : alignCode === "C" ? "center" : alignCode === "L" ? "left" : undefined,
      width,
    };
  });
}

function createDataGridBlankRows(node: CanvasNode, grid: { columns: ParsedDataGridColumn[]; rows: string[][] }) {
  const fontSize = node.fontSize ?? 14;
  const lineHeight = fontSize * 1.2;
  const cellVerticalPadding = 8;
  const rowHeight = Math.ceil(lineHeight + cellVerticalPadding);
  const headerHeight = Math.ceil(Math.max(...grid.columns.map((column) => dataGridLineCount(column.text)), 1) * lineHeight + cellVerticalPadding);
  const bodyHeight = grid.rows.reduce((height, row) => {
    const rowLines = Math.max(...grid.columns.map((_, index) => dataGridLineCount(row[index] ?? "")), 1);
    return height + Math.ceil(rowLines * lineHeight + cellVerticalPadding);
  }, 0);
  const borderAllowance = 4;
  const extraHeight = node.height - headerHeight - bodyHeight - borderAllowance;
  return Array.from({ length: Math.max(0, Math.floor(extraHeight / rowHeight) - 1) }, (_, index) => `blank-${index}`);
}

function dataGridLineCount(cell: string) {
  return Math.max(1, cell.split(/\\r/g).length);
}

function parseHeaderCell(cell: string): { text: string; sort?: string } {
  const match = cell.match(/\s+(\^v|\^|v)$/);
  if (!match) return { text: cell };
  const sortToken = match[1];
  return {
    text: cell.slice(0, -sortToken.length).trim(),
    sort: sortToken === "^" ? "▲" : sortToken === "v" ? "▼" : "▲▼",
  };
}

function DataGridCell({ cell }: { cell: string }) {
  const trimmed = cell.trim();
  const control = parseDataGridControl(trimmed);
  if (control) return <span className={`data-grid-control ${control.kind} ${control.state}`} />;
  const link = trimmed.match(/^\[([^\]]+)\](?:\([^)]+\))?$/);
  if (link) return <span className="data-grid-link">{renderInlineFormatting(link[1].trim())}</span>;
  return (
    <>
      {cell.split(/\\r/g).map((part, index) => (
        <span key={`${part}-${index}`} className="data-grid-cell-line">
          {renderInlineFormatting(part)}
        </span>
      ))}
    </>
  );
}

function parseDataGridControl(cell: string): { kind: "checkbox" | "radio"; state: "empty" | "checked" | "mixed" } | null {
  if (/^\[\s*\]$/.test(cell) || cell === "[]") return { kind: "checkbox", state: "empty" };
  if (/^\[(x|v|o|\*|X|V|O)\]$/.test(cell)) return { kind: "checkbox", state: "checked" };
  if (/^\[(-|=)\]$/.test(cell)) return { kind: "checkbox", state: "mixed" };
  if (/^\(\s*\)$/.test(cell) || cell === "()") return { kind: "radio", state: "empty" };
  if (/^\((x|v|o|\*|X|V|O)\)$/.test(cell)) return { kind: "radio", state: "checked" };
  if (/^\((-|=)\)$/.test(cell)) return { kind: "radio", state: "mixed" };
  return null;
}

function CalendarVisual({ node }: { node: CanvasNode }) {
  return <div className="calendar-node"><strong>{renderInlineFormatting(node.text ?? "")}</strong>{Array.from({ length: 35 }, (_, index) => <span key={index}>{index > 4 ? index - 4 : ""}</span>)}</div>;
}

function SiteMapVisual({ node }: { node: CanvasNode }) {
  const items = nodeOptions(node);
  return <div className="site-map-node"><strong>{renderInlineFormatting(items[0] ?? "")}</strong>{items.slice(1).map((item) => <span key={item}>{renderInlineFormatting(item)}</span>)}</div>;
}

function ChartVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "chartPie") return <div className="chart-pie-node" />;
  if (node.kind === "chartLine") return <div className="chart-line-node"><span /><span /><span /></div>;
  if (node.kind === "chartBar" || node.kind === "chartColumn") return <div className={`chart-bars-node ${node.kind}`}>{[58, 82, 42, 68].map((value) => <span key={value} style={{ "--bar-value": `${value}%` } as React.CSSProperties} />)}</div>;
  if (node.kind === "hScrollBar" || node.kind === "vScrollBar") return <div className={`scrollbar-node ${node.kind}`}><span /></div>;
  if (node.kind === "hSlider" || node.kind === "vSlider" || node.kind === "volumeSlider") return <div className={`slider-node ${node.kind}`}><span /><i style={{ "--slider-value": `${nodePercent(node)}%` } as React.CSSProperties} /></div>;
  return null;
}

function MarkupVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "arrow") return <div className="arrow-node"><span /></div>;
  if (node.kind === "hRule" || node.kind === "vRule") return <div className={`rule-node ${node.kind}`} />;
  if (node.kind === "hSplitter" || node.kind === "vSplitter") return <div className={`splitter-node ${node.kind}`}><span /></div>;
  if (node.kind === "redX") return <div className="red-x-node"><span /><span /></div>;
  if (node.kind === "scratchOut") return <div className="scratch-node">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
  if (node.kind === "squigglyLine") return <div className="squiggly-line-node" />;
  if (node.kind === "hCurlyBrace" || node.kind === "vCurlyBrace") return <div className={`curly-node ${node.kind}`}><span>{node.kind === "hCurlyBrace" ? "︷" : "}"}</span><small>{renderInlineFormatting(node.text ?? "")}</small></div>;
  if (node.kind === "shape") return <div className="shape-node" />;
  return null;
}

function MediaVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "icon") {
    const Icon = getLucideIcon(node.icon);
    return <Icon className="icon-node" data-link-key="whole" size={Math.max(12, Math.min(node.width, node.height) - 14)} />;
  }
  if (node.kind === "iconText") {
    const Icon = getLucideIcon(node.icon);
    return <div className="icon-text-node" data-link-key="whole"><Icon size={Math.max(22, Math.min(node.width, node.height) / 2)} /><span>{renderInlineFormatting(node.text ?? "")}</span></div>;
  }
  if (node.kind === "image") {
    if (node.imageDataUrl) {
      return <img className="image-node image-node-bitmap" src={node.imageDataUrl} alt={node.name || "Image"} draggable={false} />;
    }
    return <div className="image-node"><span /><span /></div>;
  }
  if (node.kind === "webcam") return <div className="webcam-node"><span /><i /></div>;
  if (node.kind === "videoPlayer") return <div className="video-node"><section /><footer><span /><b /></footer></div>;
  if (node.kind === "coverFlow") return <div className="coverflow-node"><span /><span /><span /></div>;
  if (node.kind === "smartphone" || node.kind === "iphone" || node.kind === "ipad") return <DeviceVisual node={node} />;
  if (node.kind === "iosKeyboard") return <div className="ios-keyboard-node">{Array.from({ length: 30 }, (_, index) => <span key={index}>{index === 26 ? "space" : ""}</span>)}</div>;
  if (node.kind === "iosMenu") return <div className="ios-menu-node">{nodeOptions(node).map((item) => <span key={item}>{renderInlineFormatting(item)}</span>)}</div>;
  if (node.kind === "iosPicker") return <div className="ios-picker-node">{nodeOptions(node).map((item) => <span key={item}>{renderInlineFormatting(item)}</span>)}</div>;
  return null;
}

function DeviceVisual({ node }: { node: CanvasNode }) {
  return <div className={`device-node ${node.kind}`}><span /><section /></div>;
}

function Segmented({
  items,
  activeIndex,
  compact = false,
  selected,
  linksActive,
  onLinkClick,
}: {
  items: string[];
  activeIndex: number;
  compact?: boolean;
  selected?: boolean;
  linksActive?: boolean;
  onLinkClick?: (key: string) => void;
}) {
  return (
    <div className={compact ? "segmented compact" : "segmented"}>
      {items.map((item, index) => (
        <span
          key={`${item}-${index}`}
          className={index === activeIndex ? "is-active" : ""}
          data-link-key={compact ? linkKeyForIndex("item", item, index) : undefined}
          onPointerDown={(event) => {
            if (compact && linksActive && selected && onLinkClick) event.stopPropagation();
          }}
        >
          {renderInlineFormatting(item)}
        </span>
      ))}
    </div>
  );
}

function FloatingTextEditor({
  editor,
  onChange,
  onCommit,
  onCancel,
}: {
  editor: TextEditorState;
  onChange: (draft: string) => void;
  onCommit: (draft?: string) => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const undoStackRef = useRef<TextEditSnapshot[]>([]);
  const redoStackRef = useRef<TextEditSnapshot[]>([]);
  const lineCount = Math.max(1, editor.draft.split("\n").length);
  const naturalHeight = editor.multiline ? 56 + lineCount * 28 : editor.height;
  const editorHeight = editor.multiline ? clamp(naturalHeight, editor.height, editor.maxHeight) : editor.height;
  const setTextareaSelection = (snapshot: Pick<TextEditSnapshot, "selectionStart" | "selectionEnd">) => {
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      rememberTextInputSelection(textarea);
    });
  };
  const applyTextChange = (snapshot: TextEditSnapshot) => {
    onChange(snapshot.value);
    setTextareaSelection(snapshot);
  };
  const pushUndoSnapshot = (snapshot: TextEditSnapshot) => {
    const previous = undoStackRef.current.at(-1);
    if (
      previous &&
      previous.value === snapshot.value &&
      previous.selectionStart === snapshot.selectionStart &&
      previous.selectionEnd === snapshot.selectionEnd
    ) {
      return;
    }
    undoStackRef.current = [...undoStackRef.current, snapshot].slice(-100);
    redoStackRef.current = [];
  };
  const selectedText = (textarea: HTMLTextAreaElement) => {
    const { value, selectionStart, selectionEnd } = textInputSnapshot(textarea);
    return value.slice(selectionStart, selectionEnd);
  };
  const writeSelectionToClipboard = (textarea: HTMLTextAreaElement) => {
    const text = selectedText(textarea);
    if (!text) return;
    document.execCommand("copy");
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };
  const pasteFromClipboard = (textarea: HTMLTextAreaElement) => {
    void (async () => {
      try {
        const text = await navigator.clipboard?.readText();
        if (typeof text === "string") {
          applyTextChange(replaceTextInputSelection(textarea, text));
          return;
        }
      } catch {
        // Fall back to the webview's native paste command when direct clipboard access is unavailable.
      }
      document.execCommand("paste");
      rememberTextInputSelection(textarea);
    })();
  };
  const isPlainTextEditKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    return event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    undoStackRef.current = [];
    redoStackRef.current = [];
    textarea.focus();
    textarea.select();
    rememberTextInputSelection(textarea);
  }, [editor.nodeId, editor.field]);

  return (
    <div
      className={editor.multiline ? "floating-text-editor is-multiline" : "floating-text-editor"}
      style={{ left: editor.x, top: editor.y, width: editor.width, height: editorHeight, maxHeight: editor.maxHeight }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={editor.draft}
        rows={editor.multiline ? 6 : 1}
        onChange={(event) => {
          onChange(event.target.value);
          rememberTextInputSelection(event.currentTarget);
        }}
        onFocus={(event) => rememberTextInputSelection(event.currentTarget)}
        onSelect={(event) => rememberTextInputSelection(event.currentTarget)}
        onKeyUp={(event) => rememberTextInputSelection(event.currentTarget)}
        onMouseUp={(event) => rememberTextInputSelection(event.currentTarget)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          const textarea = event.currentTarget;
          const modifier = event.metaKey || event.ctrlKey;
          const key = event.key.toLowerCase();
          if (modifier && ["c", "x", "v", "z"].includes(key)) {
            event.preventDefault();
            event.stopPropagation();
            if (key === "c") {
              writeSelectionToClipboard(textarea);
              return;
            }
            if (key === "x") {
              pushUndoSnapshot(textInputSnapshot(textarea));
              writeSelectionToClipboard(textarea);
              applyTextChange(replaceTextInputSelection(textarea, ""));
              return;
            }
            if (key === "v") {
              pushUndoSnapshot(textInputSnapshot(textarea));
              pasteFromClipboard(textarea);
              return;
            }
            if (key === "z") {
              if (event.shiftKey) {
                const next = redoStackRef.current.pop();
                if (!next) return;
                undoStackRef.current = [...undoStackRef.current, textInputSnapshot(textarea)].slice(-100);
                applyTextChange(next);
                return;
              }
              const previous = undoStackRef.current.pop();
              if (!previous) return;
              redoStackRef.current = [...redoStackRef.current, textInputSnapshot(textarea)].slice(-100);
              applyTextChange(previous);
              return;
            }
          }
          if (isPlainTextEditKey(event)) pushUndoSnapshot(textInputSnapshot(textarea));
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (!editor.multiline && event.key === "Enter") {
            event.preventDefault();
            onCommit(textarea.value);
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onCommit(textarea.value);
          }
        }}
      />
      <span className="floating-text-count">{editor.draft.length}</span>
    </div>
  );
}

type LinkableElement = {
  key: string;
  label: string;
};

function linkableElementsForNode(node: CanvasNode): LinkableElement[] {
  const whole = { key: "whole", label: "Whole Control" };
  if (["button", "circleButton", "pointyButton", "multilineButton", "helpButton", "icon", "iconText"].includes(node.kind)) return [whole];
  if (node.kind === "treePane") {
    return parseTreePaneRows(node).map((row) => ({ key: row.key, label: row.label || "Untitled row" }));
  }
  if (isTabsNode(node)) {
    return nodeOptions(node).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item || `Tab ${index + 1}` }));
  }
  if (node.kind === "buttonBar") {
    return nodeOptions(node).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: `Item ${index + 1}` }));
  }
  if (node.kind === "alertBox" || node.kind === "alertBoxAndroid") {
    return nodeOptions(node, ["No", "Yes"]).map((item, index) => ({ key: linkKeyForIndex("item", item, index), label: item || `Button ${index + 1}` }));
  }
  if (["accordion", "linkBar", "breadcrumbs", "menuBar", "menu", "toolbar", "vTabs", "list", "listIcon"].includes(node.kind)) {
    return nodeOptions(node).map((item, index) => {
      const label = node.kind === "accordion" ? item.replace(/^\s*-\s*/, "") : item;
      return { key: linkKeyForIndex("item", item, index), label: label || `Item ${index + 1}` };
    });
  }
  if (["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link"].includes(node.kind)) {
    return [
      ...extractMarkdownLinks(node.text ?? "").map((link) => ({ key: `text:${linkKeyFromLabel(link, "link")}`, label: link })),
      whole,
    ];
  }
  return [];
}

function LinkTargetSelect({
  value,
  wireframes,
  onChange,
}: {
  value: CanvasLink | undefined;
  wireframes: Wireframe[];
  onChange: (link: CanvasLink | undefined | "new-wireframe" | "duplicate-wireframe") => void;
}) {
  const selectValue = value ? (value.kind === "wireframe" ? `wireframe:${value.wireframeId}` : value.kind) : "";
  return (
    <select
      value={selectValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        if (!nextValue) onChange(undefined);
        else if (nextValue === "url") {
          const url = window.prompt("Link to a Web Address", value?.kind === "url" ? value.url : "https://");
          onChange(url ? { kind: "url", url } : value);
        } else if (nextValue === "new-wireframe") onChange("new-wireframe");
        else if (nextValue === "duplicate-wireframe") onChange("duplicate-wireframe");
        else if (nextValue === "back") onChange({ kind: "back" });
        else if (nextValue.startsWith("wireframe:")) onChange({ kind: "wireframe", wireframeId: nextValue.slice("wireframe:".length) });
      }}
    >
      <option value="">No Link</option>
      {wireframes.map((wireframe) => (
        <option key={wireframe.id} value={`wireframe:${wireframe.id}`}>
          {wireframe.name}
        </option>
      ))}
      <option value="url">Link to a Web Address...</option>
      <option value="new-wireframe">Link to New Wireframe</option>
      <option value="duplicate-wireframe">Link to a Duplicate of This Wireframe</option>
      <option value="back">Go Back</option>
    </select>
  );
}

function CommaOptionsInput({ node, onCommit }: { node: CanvasNode; onCommit: (options: string[]) => void }) {
  const optionsDraft = optionsEditDraft(node);
  const [draft, setDraft] = useState(() => optionsDraft);

  useEffect(() => {
    setDraft(optionsDraft);
  }, [node.id, optionsDraft]);

  const commit = () => {
    onCommit(parseOptionsEditDraft(node, draft));
  };

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ButtonBarProperties({
  node,
  onChange,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
}) {
  const options = nodeOptions(node);
  const activeIndex = options.length ? clamp(node.activeIndex ?? 0, 0, options.length - 1) : -1;

  return (
    <section className="property-section">
      <h3>Selection</h3>
      <select
        value={String(activeIndex)}
        disabled={!options.length}
        onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
      >
        {!options.length ? <option value="-1">No Items</option> : null}
        {options.map((item, index) => (
          <option key={`${item}-${index}`} value={index}>
            {item || `Item ${index + 1}`}
          </option>
        ))}
      </select>
    </section>
  );
}

function TabsProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const options = nodeOptions(node, ["One", "Two", "Three", "Four"]);
  const activeIndex = clamp(node.activeIndex ?? -1, -1, options.length - 1);
  const tabPlacement = node.tabPlacement ?? "top";
  const tabAlignment = node.tabAlignment ?? "left";

  return (
    <>
      <section className="property-section">
        <h3>Scrollbar</h3>
        <label className="icon-toggle-setting" title="Show scrollbar">
          <input
            type="checkbox"
            checked={Boolean(node.showScrollbar)}
            onChange={(event) => onChange("showScrollbar", { showScrollbar: event.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </section>
      <section className="property-section">
        <h3>Selection</h3>
        <select
          value={String(activeIndex)}
          onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
        >
          <option value="-1">None</option>
          {options.map((item, index) => (
            <option key={`${item}-${index}`} value={index}>
              {item || `Tab ${index + 1}`}
            </option>
          ))}
        </select>
      </section>
      <section className="property-section">
        <h3>Tabs Position</h3>
        <div className="tabs-position-controls">
          <div className="toolbar-group">
            <button type="button" className={tabPlacement === "top" ? "is-active" : ""} title="Tabs on top" onClick={() => onChange("tabPlacement", { tabPlacement: "top" })}>
              <PanelTop size={18} />
            </button>
            <button type="button" className={tabPlacement === "bottom" ? "is-active" : ""} title="Tabs on bottom" onClick={() => onChange("tabPlacement", { tabPlacement: "bottom" })}>
              <PanelBottom size={18} />
            </button>
          </div>
          <div className="toolbar-group">
            <button type="button" className={tabAlignment === "left" ? "is-active" : ""} title="Align tabs left" onClick={() => onChange("tabAlignment", { tabAlignment: "left" })}>
              <AlignLeft size={18} />
            </button>
            <button type="button" className={tabAlignment === "center" ? "is-active" : ""} title="Align tabs center" onClick={() => onChange("tabAlignment", { tabAlignment: "center" })}>
              <AlignCenter size={18} />
            </button>
            <button type="button" className={tabAlignment === "right" ? "is-active" : ""} title="Align tabs right" onClick={() => onChange("tabAlignment", { tabAlignment: "right" })}>
              <AlignRight size={18} />
            </button>
          </div>
        </div>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar tabs-text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={node.textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !node.textUnderline })}><Underline size={18} /></button>
          </div>
          <input
            type="number"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(event) => onChange("fontSize", { fontSize: Number(event.target.value) })}
          />
        </div>
      </section>
      <label>
        Tab Labels
        <CommaOptionsInput
          node={node}
          onCommit={(nextOptions) => {
            onChange("options", { options: nextOptions });
            onChangeEnd();
          }}
        />
      </label>
    </>
  );
}

function AccordionProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const sections = parseAccordionSections(node);
  const activeIndex = accordionOpenIndex(node);
  const textUnderline = Boolean(node.textUnderline);

  return (
    <>
      <section className="property-section">
        <h3>Scrollbar</h3>
        <label className="icon-toggle-setting" title="Show scrollbar">
          <input
            type="checkbox"
            checked={Boolean(node.showScrollbar)}
            onChange={(event) => onChange("showScrollbar", { showScrollbar: event.target.checked })}
          />
          <span aria-hidden="true" />
        </label>
      </section>
      <section className="property-section">
        <h3>Selection</h3>
        <select
          value={String(activeIndex)}
          disabled={!sections.length}
          onChange={(event) => onChange("activeIndex", { activeIndex: Number(event.target.value) })}
        >
          {!sections.length ? <option value="-1">No Items</option> : null}
          {sections.map((section) => (
            <option key={`${section.raw}-${section.optionIndex}`} value={section.optionIndex}>
              {section.title || `Item ${section.optionIndex + 1}`}
            </option>
          ))}
        </select>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
          </div>
          <input
            type="number"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(event) => onChange("fontSize", { fontSize: Number(event.target.value) })}
          />
        </div>
      </section>
    </>
  );
}

function AlertProperties({
  node,
  onChange,
  onChangeEnd,
}: {
  node: CanvasNode;
  onChange: (property: keyof CanvasNode, patch: Partial<CanvasNode>) => void;
  onChangeEnd: () => void;
}) {
  const textAlign = node.textAlign ?? (node.kind === "alertBox" ? "center" : "left");
  const textUnderline = Boolean(node.textUnderline);

  return (
    <>
      <section className="property-section">
        <h3>Border</h3>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={node.showBorder !== false}
            onChange={(event) => onChange("showBorder", { showBorder: event.target.checked })}
          />
          <span>Show Border</span>
        </label>
      </section>
      <section className="property-section">
        <h3>Text</h3>
        <div className="text-toolbar">
          <div className="toolbar-group">
            <button type="button" className={node.textBold ? "is-active" : ""} title="Bold" onClick={() => onChange("textBold", { textBold: !node.textBold })}><Bold size={18} /></button>
            <button type="button" className={node.textItalic ? "is-active" : ""} title="Italic" onClick={() => onChange("textItalic", { textItalic: !node.textItalic })}><Italic size={18} /></button>
            <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => onChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
          </div>
          <div className="toolbar-group">
            <button type="button" className={textAlign === "left" ? "is-active" : ""} title="Align left" onClick={() => onChange("textAlign", { textAlign: "left" })}><AlignLeft size={18} /></button>
            <button type="button" className={textAlign === "center" ? "is-active" : ""} title="Align center" onClick={() => onChange("textAlign", { textAlign: "center" })}><AlignCenter size={18} /></button>
            <button type="button" className={textAlign === "right" ? "is-active" : ""} title="Align right" onClick={() => onChange("textAlign", { textAlign: "right" })}><AlignRight size={18} /></button>
          </div>
          <input
            type="number"
            min={8}
            max={72}
            value={node.fontSize ?? 14}
            onBlur={onChangeEnd}
            onChange={(event) => onChange("fontSize", { fontSize: Number(event.target.value) })}
          />
        </div>
      </section>
    </>
  );
}

function PropertiesPane({
  selectedNode,
  selectedCount,
  activeWireframe,
  onWireframeChange,
  onNodeChange,
  onNodeChangeEnd,
  onLayer,
  projectWireframes,
  onCreateWireframeForLink,
  onDuplicateWireframeForLink,
}: {
  selectedNode: CanvasNode | null;
  selectedCount: number;
  activeWireframe: Wireframe | undefined;
  onWireframeChange: (patch: Partial<Wireframe>) => void;
  onNodeChange: (patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => void;
  onNodeChangeEnd: () => void;
  onLayer: (action: "front" | "back" | "forward" | "backward") => void;
  projectWireframes: Wireframe[];
  onCreateWireframeForLink: () => string;
  onDuplicateWireframeForLink: () => string;
}) {
  if (!selectedNode) {
    const background = wireframeBackground(activeWireframe);
    const showGrid = wireframeShowGrid(activeWireframe);
    return (
      <div className="properties canvas-properties">
        <div className="properties-title">
          <h2>Canvas</h2>
        </div>
        <section className="property-section">
          <h3>Background</h3>
          <div className="segmented-property">
            <button
              type="button"
              className={background === "white" ? "is-active" : ""}
              onClick={() => onWireframeChange({ background: "white" })}
            >
              White
            </button>
            <button
              type="button"
              className={background === "black" ? "is-active" : ""}
              onClick={() => onWireframeChange({ background: "black" })}
            >
              Black
            </button>
          </div>
        </section>
        <section className="property-section">
          <h3>Grid</h3>
          <label className="toggle-setting">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(event) => onWireframeChange({ showGrid: event.target.checked })}
            />
            <span>Show grid lines</span>
          </label>
        </section>
      </div>
    );
  }

  const groupedChange = (property: keyof CanvasNode, patch: Partial<CanvasNode>) => {
    onNodeChange(patch, { groupKey: `property:${selectedNode.id}:${property}` });
  };
  const isTextNode = ["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link", "squigglyParagraph"].includes(selectedNode.kind);
  const textAlign = selectedNode.textAlign ?? "left";
  const textUnderline = selectedNode.textUnderline ?? selectedNode.kind === "link";
  const isTabs = isTabsNode(selectedNode);
  const isAccordion = selectedNode.kind === "accordion";
  const isAlert = selectedNode.kind === "alertBox" || selectedNode.kind === "alertBoxAndroid";
  const isButtonBar = selectedNode.kind === "buttonBar";
  const isDataGrid = selectedNode.kind === "dataGrid";
  const linkableElements = linkableElementsForNode(selectedNode);
  const changeLink = (key: string, link: CanvasLink | undefined | "new-wireframe" | "duplicate-wireframe") => {
    const nextLink =
      link === "new-wireframe"
        ? { kind: "wireframe" as const, wireframeId: onCreateWireframeForLink() }
        : link === "duplicate-wireframe"
          ? { kind: "wireframe" as const, wireframeId: onDuplicateWireframeForLink() }
          : link;
    const nextLinks = { ...(selectedNode.links ?? {}) };
    if (nextLink) nextLinks[key] = nextLink;
    else delete nextLinks[key];
    onNodeChange({ links: Object.keys(nextLinks).length ? nextLinks : undefined });
  };

  return (
    <div className="properties">
      <div className="properties-title">
        <h2>{selectedCount > 1 ? `${selectedCount} selected` : displayNodeName(selectedNode)}</h2>
        <ChevronDown size={20} />
      </div>
      <section className="property-section">
        <div className="property-row">
          <strong>Position</strong>
          <label>
            <input type="number" value={selectedNode.x} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("x", { x: Number(event.target.value) })} />
            <span>X</span>
          </label>
          <label>
            <input type="number" value={selectedNode.y} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("y", { y: Number(event.target.value) })} />
            <span>Y</span>
          </label>
        </div>
        <div className="property-row">
          <strong>Size</strong>
          <label>
            <input type="number" value={selectedNode.width} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("width", { width: Number(event.target.value) })} />
            <span>Width</span>
          </label>
          <label>
            <input type="number" value={selectedNode.height} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("height", { height: Number(event.target.value) })} />
            <span>Height</span>
          </label>
        </div>
      </section>
      <section className="property-section">
        <h3>Layering</h3>
        <div className="layer-button-groups">
          <button type="button" onClick={() => onLayer("back")} title="Send to back"><SendToBack size={18} /><span>Back</span></button>
          <button type="button" onClick={() => onLayer("front")} title="Bring to front"><BringToFront size={18} /><span>Front</span></button>
          <button type="button" onClick={() => onLayer("backward")} title="Send backward"><SendToBack size={18} /><span>Backward</span></button>
          <button type="button" onClick={() => onLayer("forward")} title="Bring forward"><BringToFront size={18} /><span>Forward</span></button>
        </div>
      </section>
      {isTabs ? (
        <>
          <section className="property-section">
            <h3>Border</h3>
            <label className="toggle-setting">
              <input
                type="checkbox"
                checked={selectedNode.showBorder !== false}
                onChange={(event) => groupedChange("showBorder", { showBorder: event.target.checked })}
              />
              <span>Show Border</span>
            </label>
          </section>
          <label className="property-swatch-row">
            Color
            <input type="color" value={selectedNode.fill ?? "#ffffff"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("fill", { fill: event.target.value })} />
          </label>
          <label className="property-range-row">
            Opacity
            <input
              type="range"
              min={0}
              max={100}
              value={selectedNode.opacity ?? 100}
              onBlur={onNodeChangeEnd}
              onChange={(event) => groupedChange("opacity", { opacity: Number(event.target.value) })}
            />
          </label>
        </>
      ) : !isTextNode ? (
        <>
          <label>
            Fill
            <input type="color" value={selectedNode.fill ?? "#ffffff"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("fill", { fill: event.target.value })} />
          </label>
          <label>
            Stroke
            <input type="color" value={selectedNode.stroke ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("stroke", { stroke: event.target.value })} />
          </label>
        </>
      ) : null}
      {!isTabs ? (
        <label className="property-swatch-row">
          Text Color
          <input type="color" value={selectedNode.textColor ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("textColor", { textColor: event.target.value })} />
        </label>
      ) : null}
      {linkableElements.length ? (
        <section className="property-section">
          <div className="property-section-heading">
            <h3>Links</h3>
            <button type="button">Hide</button>
          </div>
          <div className="links-editor">
            {linkableElements.map((item) => (
              <div key={item.key} className="link-row">
                <span title={item.label}>{item.label}</span>
                <LinkTargetSelect
                  value={selectedNode.links?.[item.key]}
                  wireframes={projectWireframes}
                  onChange={(link) => changeLink(item.key, link)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {isButtonBar ? (
        <ButtonBarProperties node={selectedNode} onChange={groupedChange} />
      ) : null}
      {isTabs ? (
        <TabsProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : isAccordion ? (
        <AccordionProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : isAlert ? (
        <AlertProperties node={selectedNode} onChange={groupedChange} onChangeEnd={onNodeChangeEnd} />
      ) : isTextNode ? (
        <>
          <section className="property-section">
            <h3>State</h3>
            <select defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="disabled">Disabled</option>
            </select>
          </section>
          <section className="property-section">
            <h3>Text</h3>
            <div className="text-toolbar">
              <div className="toolbar-group">
                <button type="button" className={selectedNode.textBold ? "is-active" : ""} title="Bold" onClick={() => groupedChange("textBold", { textBold: !selectedNode.textBold })}><Bold size={18} /></button>
                <button type="button" className={selectedNode.textItalic ? "is-active" : ""} title="Italic" onClick={() => groupedChange("textItalic", { textItalic: !selectedNode.textItalic })}><Italic size={18} /></button>
                <button type="button" className={textUnderline ? "is-active" : ""} title="Underline" onClick={() => groupedChange("textUnderline", { textUnderline: !textUnderline })}><Underline size={18} /></button>
              </div>
              <div className="toolbar-group">
                <button type="button" className={textAlign === "left" ? "is-active" : ""} title="Align left" onClick={() => groupedChange("textAlign", { textAlign: "left" })}><AlignLeft size={18} /></button>
                <button type="button" className={textAlign === "center" ? "is-active" : ""} title="Align center" onClick={() => groupedChange("textAlign", { textAlign: "center" })}><AlignCenter size={18} /></button>
                <button type="button" className={textAlign === "right" ? "is-active" : ""} title="Align right" onClick={() => groupedChange("textAlign", { textAlign: "right" })}><AlignRight size={18} /></button>
              </div>
              <input
                type="number"
                min={8}
                max={72}
                value={selectedNode.fontSize ?? 14}
                onBlur={onNodeChangeEnd}
                onChange={(event) => groupedChange("fontSize", { fontSize: Number(event.target.value) })}
              />
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="property-section">
            <h3>State</h3>
            <select defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="disabled">Disabled</option>
            </select>
          </section>
          <label>
            Font Size
            <input
              type="number"
              min={8}
              max={72}
              value={selectedNode.fontSize ?? 14}
              onBlur={onNodeChangeEnd}
              onChange={(event) => groupedChange("fontSize", { fontSize: Number(event.target.value) })}
            />
          </label>
        </>
      )}
      {"value" in selectedNode ? (
        <label>
          Value
          <input value={selectedNode.value ?? ""} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("value", { value: event.target.value })} />
        </label>
      ) : null}
      {"placeholder" in selectedNode ? (
        <label>
          Placeholder
          <input value={selectedNode.placeholder ?? ""} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("placeholder", { placeholder: event.target.value })} />
        </label>
      ) : null}
      {"text" in selectedNode ? (
        <label>
          {isDataGrid ? "Data Grid" : "Text"}
          <textarea value={selectedNode.text ?? ""} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("text", { text: event.target.value })} />
        </label>
      ) : null}
      {selectedNode.options && !isTabs && usesCommaSeparatedOptions(selectedNode) ? (
        <label>
          Options
          <CommaOptionsInput
            node={selectedNode}
            onCommit={(options) => {
              groupedChange("options", { options });
              onNodeChangeEnd();
            }}
          />
        </label>
      ) : null}
      {selectedNode.options && !isTabs && !usesCommaSeparatedOptions(selectedNode) ? (
        <label>
          Options
          <textarea value={selectedNode.options.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("options", { options: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.columns && !isDataGrid ? (
        <label>
          Columns
          <textarea value={selectedNode.columns.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("columns", { columns: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.rows && !isDataGrid ? (
        <label>
          Rows
          <textarea value={selectedNode.rows.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("rows", { rows: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.kind === "icon" || selectedNode.kind === "iconText" ? (
        <IconPicker value={selectedNode.icon ?? "Plus"} onChange={(name) => onNodeChange({ icon: name })} />
      ) : null}
      <label className="checkbox-setting">
        <input type="checkbox" checked={Boolean(selectedNode.locked)} onChange={(event) => onNodeChange({ locked: event.target.checked })} />
        Locked
      </label>
    </div>
  );
}

function SettingsDialog({
  appAppearance,
  onAppearanceChange,
  onClose,
}: {
  appAppearance: MockupProject["appearance"];
  onAppearanceChange: (patch: Partial<MockupProject["appearance"]>) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={onClose}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="settings-dialog-sidebar">
          <div className="settings-dialog-title">
            <span className="dialog-icon">
              <Settings size={18} />
            </span>
            <div>
              <h2 id="settings-title">Settings</h2>
              <p>Moqira preferences</p>
            </div>
          </div>
          <button className="settings-nav-item is-active" type="button">
            <Settings size={15} />
            <span>Appearance</span>
          </button>
        </aside>
        <div className="settings-dialog-content">
          <div className="settings-dialog-header">
            <h2>Appearance</h2>
            <button className="icon-button" type="button" title="Close" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
          <div className="settings-form">
            <div className="setting-row">
              <span>
                <strong>Theme</strong>
              </span>
              <select value={appAppearance.colorScheme} onChange={(event) => onAppearanceChange({ colorScheme: event.target.value as never })}>
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="setting-row">
              <span>
                <strong>Accent</strong>
              </span>
              <input type="color" value={appAppearance.accentColor} onChange={(event) => onAppearanceChange({ accentColor: event.target.value })} />
            </div>
            <div className="setting-row">
              <span>
                <strong>App font size</strong>
              </span>
              <input
                type="number"
                min={12}
                max={18}
                value={appAppearance.appFontSize}
                onChange={(event) => onAppearanceChange({ appFontSize: Number(event.target.value) })}
              />
            </div>
            <div className="setting-row">
              <span>
                <strong>Accent titlebar</strong>
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={appAppearance.accentTitlebar}
                  onChange={(event) => onAppearanceChange({ accentTitlebar: event.target.checked })}
                />
                <span className="switch-track" />
              </label>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ContextMenu({
  state,
  targetName,
  canPaste,
  onClose,
  onSelect,
  onCut,
  onCopy,
  onPaste,
  onDelete,
  onLayer,
}: {
  state: ContextMenuState;
  targetName: string;
  canPaste: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onLayer: (action: "front" | "back" | "forward" | "backward") => void;
}) {
  const disabled = !state.targetId;
  const item = (label: string, action: () => void, isDisabled = false) => (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="context-scrim" onClick={onClose}>
      <div className="context-menu" style={{ left: state.x, top: state.y }} onClick={(event) => event.stopPropagation()}>
        <div className="context-menu-header">{targetName}</div>
        {state.stack.length > 1 ? (
          <div className="context-submenu">
            <button type="button" className="has-submenu">Select object<span>›</span></button>
            <div className="submenu-panel">
              {state.stack.map((node) => (
                <button key={node.id} type="button" onClick={() => onSelect(node.id)}>
                  {node.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {item("Cut", onCut, disabled)}
        {item("Copy", onCopy, disabled)}
        {item("Paste Here", onPaste, !canPaste)}
        {item("Delete", onDelete, disabled)}
        <hr />
        {item("Bring Forward", () => onLayer("forward"), disabled)}
        {item("Bring to Front", () => onLayer("front"), disabled)}
        {item("Send Backward", () => onLayer("backward"), disabled)}
        {item("Send to Back", () => onLayer("back"), disabled)}
      </div>
    </div>
  );
}

function WireframeContextMenu({
  state,
  canDelete,
  canDuplicate,
  canRename,
  onClose,
  onNew,
  onRename,
  onDuplicate,
  onDelete,
}: {
  state: WireframeContextMenuState;
  canDelete: boolean;
  canDuplicate: boolean;
  canRename: boolean;
  onClose: () => void;
  onNew: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="context-scrim" onClick={onClose}>
      <div className="context-menu" style={{ left: state.x, top: state.y }} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            onNew();
            onClose();
          }}
        >
          New Wireframe
        </button>
        <button
          type="button"
          disabled={!canRename}
          onClick={() => {
            onRename();
            onClose();
          }}
        >
          Rename Wireframe
        </button>
        <button
          type="button"
          disabled={!canDuplicate}
          onClick={() => {
            onDuplicate();
            onClose();
          }}
        >
          Duplicate Wireframe
        </button>
        <button
          type="button"
          disabled={!canDelete}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete Wireframe
        </button>
      </div>
    </div>
  );
}

function RenameWireframeDialog({
  state,
  wireframes,
  onChange,
  onCancel,
  onSave,
}: {
  state: RenameWireframeState;
  wireframes: Wireframe[];
  onChange: (draft: string) => void;
  onCancel: () => void;
  onSave: () => boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedName = state.draft.trim();
  const duplicate = wireframes.some((wireframe) => wireframe.id !== state.wireframeId && wireframe.name.trim().toLowerCase() === trimmedName.toLowerCase());
  const error = !trimmedName ? "Wireframe name is required." : duplicate ? "Another wireframe already uses that name." : "";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [state.wireframeId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={onCancel}>
      <section className="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-wireframe-title" onMouseDown={(event) => event.stopPropagation()}>
        <h2 id="rename-wireframe-title">Rename Wireframe</h2>
        <label>
          Name
          <input
            ref={inputRef}
            value={state.draft}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !error) {
                event.preventDefault();
                onSave();
              }
            }}
          />
        </label>
        {error ? <p className="dialog-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary" disabled={Boolean(error)} onClick={onSave}>Save</button>
        </div>
      </section>
    </div>
  );
}

function UnsavedChangesDialog({
  projectName,
  onSave,
  onDiscard,
  onCancel,
}: {
  projectName: string;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-scrim" role="presentation">
      <div className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-title">
        <h2 id="unsaved-title">Save changes?</h2>
        <p>
          {projectName} has unsaved changes. Save before closing?
        </p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const Current = getLucideIcon(value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? lucideIconNames.filter((name) => name.toLowerCase().includes(q)) : lucideIconNames;
    return list.slice(0, 300);
  }, [query]);

  return (
    <div className="icon-picker">
      <label>
        Icon
        <button type="button" className="icon-picker-trigger" onClick={() => setOpen((v) => !v)}>
          <Current size={18} />
          <span>{value}</span>
          <ChevronDown size={14} />
        </button>
      </label>
      {open ? (
        <div className="icon-picker-popover" onMouseDown={(event) => event.stopPropagation()}>
          <div className="icon-picker-search">
            <Search size={14} />
            <input
              autoFocus
              type="search"
              placeholder="Search icons..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          </div>
          <div className="icon-picker-grid">
            {filtered.map((name) => {
              const Icon = getLucideIcon(name);
              return (
                <button
                  key={name}
                  type="button"
                  className={name === value ? "icon-picker-tile is-active" : "icon-picker-tile"}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                >
                  <Icon size={18} />
                </button>
              );
            })}
            {filtered.length === 0 ? <div className="icon-picker-empty">No matches</div> : null}
          </div>
          {query.trim() && lucideIconNames.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())).length > 300 ? (
            <div className="icon-picker-hint">Showing first 300 matches — refine your search.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default App;
