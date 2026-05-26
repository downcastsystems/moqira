import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlignLeft,
  BringToFront,
  CheckSquare,
  ChevronDown,
  Clipboard,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  FilePlus2,
  FolderOpen,
  Layers,
  MousePointer2,
  PanelRight,
  Plus,
  Save,
  Search,
  SendToBack,
  Settings,
  Square,
  StickyNote,
  Type,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri, openProjectFile, readLastProjectPath, saveProjectFile, syncEditMenuState, syncRecentProjects, writeLastProjectPath } from "./lib/mockupsApi";
import type { CanvasNode, ComponentDefinition, ComponentKind, MockupProject, Wireframe } from "./types";

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
  category: Exclude<ComponentCategory, "All">,
  icon: string,
  width: number,
  height: number,
  defaults: Partial<CanvasNode> = {},
): ComponentDefinition {
  return { kind, label, category, icon, width, height, defaults };
}

const componentLibrary: ComponentDefinition[] = [
  component("rectangle", "Rectangle", "Common", "rectangle", 180, 110, { fill: "#ffffff", stroke: "#1f2937" }),
  component("button", "Button", "Common", "button", 112, 40, { text: "Button", fill: "#ffffff" }),
  component("circleButton", "Circle Button", "Common", "CirclePlus", 72, 72, { text: "+", fill: "#ffffff", fontSize: 30 }),
  component("pointyButton", "Pointy Button", "Common", "ChevronLeft", 150, 44, { text: "Button", fill: "#ffffff", variant: "left" }),
  component("multilineButton", "Multiline Button", "Common", "MousePointer2", 170, 54, { text: "Multiline Button\nSecond line of text", fill: "#ffffff" }),
  component("helpButton", "Help Button", "Common", "CircleHelp", 60, 60, { text: "?", fill: "#ffffff", fontSize: 30 }),
  component("icon", "Icon", "Common", "icon", 64, 64, { icon: "Plus", textColor: "#111827" }),
  component("iconText", "Icon and Text", "Common", "BadgeInfo", 110, 90, { icon: "Square", text: "Icon Name", textColor: "#111827" }),
  component("stickyNote", "Comment", "Common", "stickyNote", 180, 160, { text: "A comment", fill: "#fff2a8", fontSize: 16 }),

  component("text", "Text", "Text", "text", 180, 42, { text: "Text label", fontSize: 18, textColor: "#111827" }),
  component("textLabel", "Text Label", "Text", "Type", 180, 34, { text: "Some text", fontSize: 18 }),
  component("textTitle", "Text Title", "Text", "Heading1", 240, 48, { text: "A Big Title", fontSize: 28 }),
  component("textSubtitle", "Text Subtitle", "Text", "Heading2", 220, 42, { text: "A Subtitle", fontSize: 22 }),
  component("textParagraph", "Text Paragraph", "Text", "Pilcrow", 280, 96, { text: "A paragraph of text.\nA second row of text.", fontSize: 14 }),
  component("link", "Link", "Text", "Link", 120, 34, { text: "a link", textColor: "#2563eb", fontSize: 24 }),
  component("squigglyParagraph", "Squiggly Paragraph", "Text", "AlignLeft", 250, 86, { text: "A paragraph of text.\nA second row of text." }),

  component("checkbox", "Checkbox", "Forms", "checkbox", 150, 32, { text: "Checkbox", checked: false }),
  component("checkboxList", "Checkbox List", "Forms", "checkboxList", 190, 118, { options: ["not selected", "selected", "disabled"], text: "Checkbox List" }),
  component("radioButton", "Radio Button", "Forms", "CircleDot", 160, 32, { text: "Radio Button", checked: false }),
  component("radioButtonGroup", "Radio Button Group", "Forms", "ListChecks", 210, 126, { options: ["option 1", "option 2", "option 3"], text: "Radio Group" }),
  component("dropdown", "Dropdown", "Forms", "dropdown", 180, 40, { text: "Choose...", options: ["First", "Second", "Third"] }),
  component("comboBox", "ComboBox", "Forms", "ChevronDownSquare", 180, 40, { text: "ComboBox", options: ["First", "Second", "Third"] }),
  component("textbox", "Textbox", "Forms", "textbox", 190, 40, { text: "Text input" }),
  component("textInput", "Text Input", "Forms", "TextCursorInput", 190, 40, { text: "", placeholder: "Text input" }),
  component("textArea", "Text Area", "Forms", "Text", 230, 120, { text: "Text area" }),
  component("searchBox", "Search Box", "Forms", "Search", 190, 36, { text: "", placeholder: "search" }),
  component("searchBoxVoice", "Search Box + Mic", "Forms", "Mic", 210, 36, { text: "", placeholder: "search" }),
  component("colorPicker", "Color Picker", "Forms", "Palette", 76, 76, { fill: "#2563eb" }),
  component("numericStepper", "Num. Stepper", "Forms", "PanelTopOpen", 96, 58, { value: 3 }),
  component("onOffSwitch", "ON/OFF Switch", "Forms", "ToggleRight", 108, 56, { checked: true, fill: "#6cc24a" }),
  component("progressBar", "Progress Bar", "Forms", "BatteryMedium", 170, 28, { value: 45 }),
  component("progressBarIndeterminate", "Progress (Ind.)", "Forms", "MoreHorizontal", 170, 28, { variant: "indeterminate" }),

  component("tabs", "Tabs", "Navigation", "tabs", 260, 52, { options: ["One", "Two", "Three"], activeIndex: 0 }),
  component("buttonBar", "Button Bar", "Navigation", "buttonBar", 240, 40, { options: ["One", "Two", "Three"], activeIndex: 0 }),
  component("tabBar", "Tab Bar", "Navigation", "PanelTop", 260, 72, { options: ["One", "Two", "Three", "Four"], activeIndex: 0 }),
  component("vTabs", "V.Tabs", "Navigation", "PanelLeft", 150, 160, { options: ["First Tab", "Second Tab", "Third Tab", "Fourth Tab"], activeIndex: 1 }),
  component("linkBar", "Link Bar", "Navigation", "Link", 250, 38, { options: ["Home", "Products", "Company", "Blog"] }),
  component("breadcrumbs", "Breadcrumbs", "Navigation", "ChevronRight", 240, 34, { options: ["Home", "Products", "Bags", "Feature"] }),
  component("menuBar", "Menu Bar", "Navigation", "Menu", 250, 34, { options: ["File", "Edit", "View", "Help"] }),
  component("menu", "Menu", "Navigation", "PanelTopClose", 120, 142, { options: ["Open", "Open Recent", "Close", "Save", "Toggle Item"] }),
  component("appBar", "App Bar", "Navigation", "PanelTop", 180, 32, { text: "Heading" }),
  component("playback", "Playback", "Navigation", "CirclePlay", 120, 40, { options: ["rew", "play", "ff"] }),
  component("toolbar", "Toolbar", "Navigation", "Rows3", 230, 32, { options: ["B", "I", "U", "link", "align"] }),

  component("accordion", "Accordion", "Containers", "PanelTop", 170, 130, { options: ["Item One", "Item Two", "Item Three", "Item Four"] }),
  component("alertBox", "Alert Box", "Containers", "MessageSquareWarning", 220, 115, { text: "Alert text goes here", options: ["No", "Yes"] }),
  component("browser", "Browser", "Containers", "PanelTop", 220, 160, { text: "http://example.com" }),
  component("window", "Window", "Containers", "PanelTop", 220, 160, { text: "Window Title" }),
  component("modalScreen", "Modal Screen", "Containers", "PanelTop", 220, 140, { fill: "#777777" }),
  component("fieldSet", "Field Set", "Containers", "SquareDashed", 220, 170, { text: "Group Name", fill: "#ffffff" }),
  component("popover", "Popover", "Containers", "MessageSquare", 160, 105, { text: "Popover", fill: "#ffffff" }),
  component("tooltip", "Tooltip", "Containers", "MessageCircle", 165, 74, { text: "a tooltip", fill: "#ffffff" }),
  component("callout", "Callout", "Containers", "CircleAlert", 86, 86, { text: "1", fill: "#fff300", fontSize: 28 }),

  component("list", "List", "Data", "List", 140, 130, { options: ["Item One", "Item Two", "Item Three"] }),
  component("listIcon", "List with Icons", "Data", "ListChecks", 170, 130, { options: ["Item One", "Item Two", "Item Three"] }),
  component("treePane", "Tree Pane", "Data", "FolderTree", 210, 160, { options: ["▾ Home", "  ▣ page", "  ▣ page", "▸ Folder"] }),
  component("dataGrid", "Data Grid", "Data", "Table", 260, 150, { columns: ["Name", "Role", "Status"], rows: ["Alice|PM|Active", "Ben|Design|Review", "Cara|Eng|Ready"] }),
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
  component("vScrollBar", "V.Scroll Bar", "Charts", "PanelRight", 28, 180, { orientation: "vertical" }),
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
  component("squigglyLine", "Squiggly Line", "Markup", "Waves", 160, 35),
  component("hCurlyBrace", "H.Curly Brace", "Markup", "Braces", 180, 46, { text: "A paragraph of text.\nA second row of text." }),
  component("vCurlyBrace", "V.Curly Brace", "Markup", "Braces", 56, 160, { text: "A paragraph of text.\nA second row of text." }),
  component("shape", "Shape", "Markup", "Circle", 95, 95, { fill: "#ffffff" }),

  component("image", "Image", "Media", "Image", 140, 120, { fill: "#ffffff" }),
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

type DragState =
  | {
      kind: "move";
      nodeId: string;
      startX: number;
      startY: number;
      originalX: number;
      originalY: number;
      currentX: number;
      currentY: number;
    }
  | {
      kind: "resize";
      nodeId: string;
      startX: number;
      startY: number;
      originalWidth: number;
      originalHeight: number;
      currentWidth: number;
      currentHeight: number;
    };

type PaletteDragState = {
  kind: ComponentKind;
  label: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type TextEditorState = {
  nodeId: string;
  field: "text" | "options";
  draft: string;
  x: number;
  y: number;
  width: number;
  height: number;
  multiline: boolean;
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

type MenuActions = {
  newProject: () => void;
  openProject: () => void;
  saveProject: (saveAs?: boolean) => Promise<boolean>;
  undoProjectChange: () => void;
  redoProjectChange: () => void;
  cutNode: () => void;
  copyNode: () => void;
  pasteNode: () => void;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pointHitsNode(x: number, y: number, node: CanvasNode) {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
}

function moveNodeLayer(nodes: CanvasNode[], id: string, action: "front" | "back" | "forward" | "backward") {
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) return nodes;
  const next = [...nodes];
  const [node] = next.splice(index, 1);
  if (action === "front") next.push(node);
  if (action === "back") next.unshift(node);
  if (action === "forward") next.splice(clamp(index + 1, 0, next.length), 0, node);
  if (action === "backward") next.splice(clamp(index - 1, 0, next.length), 0, node);
  return next;
}

function fileNameFromPath(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function projectNameFromPath(path: string) {
  return decodeTitleFromFilename(fileNameFromPath(path).replace(/\.(moqira|dsmockup|json)$/i, "")) || "Untitled Project";
}

function defaultSaveFileName(project: MockupProject, projectPath: string | null) {
  if (projectPath) return fileNameFromPath(projectPath);
  const baseName = project.name.trim() && project.name !== "New Project" ? project.name.trim() : "Untitled Project";
  return `${encodeTitleForFilename(baseName)}.moqira`;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<CanvasNode | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [wireframeContextMenu, setWireframeContextMenu] = useState<WireframeContextMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [snapGuides, setSnapGuides] = useState<number[]>([]);
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragState | null>(null);
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [status, setStatus] = useState("Ready");
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => readRecentProjects());
  const [activeComponentCategory, setActiveComponentCategory] = useState<ComponentCategory>("All");
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(() => localStorage.getItem(leftPaneCollapsedKey) === "true");
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(() => localStorage.getItem(rightPaneCollapsedKey) === "true");

  useEffect(() => {
    localStorage.setItem(leftPaneCollapsedKey, String(leftCollapsed));
  }, [leftCollapsed]);
  useEffect(() => {
    localStorage.setItem(rightPaneCollapsedKey, String(rightCollapsed));
  }, [rightCollapsed]);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const suppressNextLibraryClickRef = useRef(false);
  const attemptedStartupRestoreRef = useRef(false);
  const dirtyRef = useRef(false);
  const activeProjectHistoryGroupKeyRef = useRef<string | null>(null);
  const savedProjectSnapshotRef = useRef(dirtyProjectSnapshot(projectHistory.present));
  const project = projectHistory.present;
  const dirty = dirtyProjectSnapshot(project) !== savedProjectSnapshotRef.current;

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
  const selectedNode = activeWireframe?.nodes.find((node) => node.id === selectedId) ?? null;
  const visibleComponentLibrary = useMemo(
    () => componentLibrary.filter((definition) => activeComponentCategory === "All" || definition.category === activeComponentCategory),
    [activeComponentCategory],
  );

  useEffect(() => {
    void syncEditMenuState({
      canUndo: projectHistory.past.length > 0,
      canRedo: projectHistory.future.length > 0,
      hasSelection: Boolean(selectedNode),
      canPaste: Boolean(clipboard),
      canLockSelection: Boolean(selectedNode && !selectedNode.locked),
      hasLockedNodes: Boolean(activeWireframe?.nodes.some((node) => node.locked)),
    });
  }, [activeWireframe?.nodes, clipboard, projectHistory.future.length, projectHistory.past.length, selectedNode]);

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
  }, [endProjectHistoryGroup]);

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
  }, [endProjectHistoryGroup]);

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
  }, [resetProjectHistory]);

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

  const addNode = useCallback(
    (kind: ComponentKind, x = 120, y = 120) => {
      const node = createNode(kind, Math.round(x), Math.round(y));
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      setStatus(`Added ${node.name}`);
    },
    [mutateActiveWireframe],
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

  const commitNodeDrag = useCallback((state: DragState) => {
    setProjectHistory((current) => {
      const originalProject = {
        ...current.present,
        wireframes: current.present.wireframes.map((wireframe) =>
          wireframe.id === current.present.activeWireframeId
            ? {
                ...wireframe,
                nodes: wireframe.nodes.map((node) => {
                  if (node.id !== state.nodeId) return node;
                  if (state.kind === "move") return { ...node, x: state.originalX, y: state.originalY };
                  return { ...node, width: state.originalWidth, height: state.originalHeight };
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

    const multiline = node.kind === "stickyNote" || field === "options";
    const nodeViewportX = canvasRect.left + node.x;
    const nodeViewportY = canvasRect.top + node.y;
    const width = Math.max(multiline ? 420 : 360, node.width + 220);
    const height = multiline ? Math.max(170, node.height + 82) : 68;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    setSelectedId(node.id);
    setTextEditor({
      nodeId: node.id,
      field,
      draft: field === "options" ? (node.options ?? []).join("\n") : node.text ?? "",
      x: clamp(nodeViewportX - 12, 12, maxX),
      y: clamp(nodeViewportY + Math.min(24, node.height), 12, maxY),
      width,
      height,
      multiline,
    });
  }, []);

  const closeTextEditor = useCallback(
    (commit: boolean) => {
      if (!textEditor) return;
      if (commit) {
        const patch =
          textEditor.field === "options"
            ? { options: textEditor.draft.split("\n") }
            : { text: textEditor.draft };
        updateNode(textEditor.nodeId, patch);
      }
      setTextEditor(null);
    },
    [textEditor, updateNode],
  );

  const deleteNode = useCallback(
    (id: string | null = selectedId) => {
      if (!id) return;
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: wireframe.nodes.filter((node) => node.id !== id) }));
      if (selectedId === id) setSelectedId(null);
      setStatus("Deleted component");
    },
    [mutateActiveWireframe, selectedId],
  );

  const duplicateNode = useCallback(
    (id: string | null = selectedId) => {
      const node = activeWireframe?.nodes.find((item) => item.id === id);
      if (!node) return;
      const duplicate = {
        ...node,
        id: createId("node"),
        x: node.x + 24,
        y: node.y + 24,
      };
      mutateActiveWireframe((wireframe) => {
        const index = wireframe.nodes.findIndex((item) => item.id === node.id);
        const nodes = [...wireframe.nodes];
        nodes.splice(index + 1, 0, duplicate);
        return { ...wireframe, nodes };
      });
      setSelectedId(duplicate.id);
      setStatus(`Duplicated ${node.name}`);
    },
    [activeWireframe?.nodes, mutateActiveWireframe, selectedId],
  );

  const copyNode = useCallback(
    (id: string | null = selectedId) => {
      const node = activeWireframe?.nodes.find((item) => item.id === id);
      if (!node) return;
      setClipboard(node);
      setStatus(`Copied ${node.name}`);
    },
    [activeWireframe?.nodes, selectedId],
  );

  const cutNode = useCallback(
    (id: string | null = selectedId) => {
      const node = activeWireframe?.nodes.find((item) => item.id === id);
      if (!node) return;
      setClipboard(node);
      deleteNode(id);
      setStatus(`Cut ${node.name}`);
    },
    [activeWireframe?.nodes, deleteNode, selectedId],
  );

  const pasteNode = useCallback(
    (x?: number, y?: number) => {
      if (!clipboard) return;
      const node = {
        ...clipboard,
        id: createId("node"),
        x: Math.round(x ?? clipboard.x + 24),
        y: Math.round(y ?? clipboard.y + 24),
        name: clipboard.name,
      };
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: [...wireframe.nodes, node] }));
      setSelectedId(node.id);
      setStatus(`Pasted ${node.name}`);
    },
    [clipboard, mutateActiveWireframe],
  );

  const layerNode = useCallback(
    (id: string | null, action: "front" | "back" | "forward" | "backward") => {
      if (!id) return;
      mutateActiveWireframe((wireframe) => ({ ...wireframe, nodes: moveNodeLayer(wireframe.nodes, id, action) }));
    },
    [mutateActiveWireframe],
  );

  const lockNode = useCallback(
    (id: string | null = selectedId) => {
      if (!id) return;
      updateNode(id, { locked: true });
      setStatus("Locked component");
    },
    [selectedId, updateNode],
  );

  const unlockAllNodes = useCallback(() => {
    mutateActiveWireframe((wireframe) => ({
      ...wireframe,
      nodes: wireframe.nodes.map((node) => (node.locked ? { ...node, locked: false } : node)),
    }));
    setStatus("Unlocked all components");
  }, [mutateActiveWireframe]);

  const selectNone = useCallback(() => {
    setSelectedId(null);
    setContextMenu(null);
    setTextEditor(null);
    setStatus("Cleared selection");
  }, []);

  const selectWireframe = useCallback((wireframeId: string) => {
    endProjectHistoryGroup();
    setProjectHistory((current) =>
      current.present.activeWireframeId === wireframeId
        ? current
        : { ...current, present: { ...current.present, activeWireframeId: wireframeId } },
    );
    setSelectedId(null);
  }, [endProjectHistoryGroup]);

  const confirmLosingUnsavedChanges = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("This project has unsaved changes. Continue without saving them?");
  }, [dirty]);

  const saveProject = useCallback(
    async (saveAs = false): Promise<boolean> => {
      let nextPath = saveAs ? null : projectPath;
      if (!nextPath || saveAs) {
        const chosen = await saveDialog({
          title: "Save Moqira Project",
          defaultPath: defaultSaveFileName(project, saveAs ? null : projectPath),
          filters: [{ name: "Moqira Project", extensions: ["moqira", "dsmockup", "json"] }],
        });
        if (!chosen) {
          setStatus(saveAs ? "Save As canceled." : "Save canceled.");
          return false;
        }
        nextPath = chosen;
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
    if (!confirmLosingUnsavedChanges()) return;
    const chosen = await openDialog({
      title: "Open Moqira Project",
      multiple: false,
      filters: [{ name: "Moqira Project", extensions: ["moqira", "dsmockup", "json"] }],
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
  }, [confirmLosingUnsavedChanges, resetProjectHistory]);

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
    [confirmLosingUnsavedChanges, resetProjectHistory],
  );

  const newProject = useCallback(() => {
    if (!confirmLosingUnsavedChanges()) return;
    resetProjectHistory(createDefaultProject());
    setProjectPath(null);
    setSelectedId(null);
    setStatus("Created new project");
  }, [confirmLosingUnsavedChanges, resetProjectHistory]);

  const menuActionsRef = useRef<MenuActions>({
    newProject: () => {},
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
    layerNode: (action) => layerNode(selectedId, action),
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

    void listen("menu-new-project", () => menuActionsRef.current.newProject()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-open-project", () => void menuActionsRef.current.openProject()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-save-project", () => void menuActionsRef.current.saveProject(false)).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-save-project-as", () => void menuActionsRef.current.saveProject(true)).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-undo-project", () => menuActionsRef.current.undoProjectChange()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-redo-project", () => menuActionsRef.current.redoProjectChange()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-cut-node", () => menuActionsRef.current.cutNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-copy-node", () => menuActionsRef.current.copyNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-paste-node", () => menuActionsRef.current.pasteNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-delete-node", () => menuActionsRef.current.deleteNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-duplicate-node", () => menuActionsRef.current.duplicateNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-select-none", () => menuActionsRef.current.selectNone()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-layer-front", () => menuActionsRef.current.layerNode("front")).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-layer-forward", () => menuActionsRef.current.layerNode("forward")).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-layer-backward", () => menuActionsRef.current.layerNode("backward")).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-layer-back", () => menuActionsRef.current.layerNode("back")).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-lock-node", () => menuActionsRef.current.lockNode()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-unlock-all-nodes", () => menuActionsRef.current.unlockAllNodes()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-open-settings", () => menuActionsRef.current.openSettings()).then((cleanup) => cleanups.push(cleanup));
    void listen<string>("menu-open-recent-project", (event) => menuActionsRef.current.openRecentProject(event.payload)).then((cleanup) => cleanups.push(cleanup));

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      event.preventDefault();
      if (dragState.kind === "move") {
        const node = activeWireframe?.nodes.find((item) => item.id === dragState.nodeId);
        if (!node) return;
        const rawX = Math.max(0, Math.round(dragState.originalX + event.clientX - dragState.startX));
        const rawY = Math.max(0, Math.round(dragState.originalY + event.clientY - dragState.startY));
        const canvasWidth = canvasRef.current?.clientWidth ?? 0;
        const threshold = 6;
        const targets: number[] = [];
        if (canvasWidth) targets.push(canvasWidth / 2);
        for (const other of activeWireframe?.nodes ?? []) {
          if (other.id === dragState.nodeId) continue;
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
        setSnapGuides(best.dist <= threshold ? best.lines : []);
        setDragState({ ...dragState, currentX: finalX, currentY: rawY });
        previewNode(dragState.nodeId, { x: finalX, y: rawY });
      } else {
        const width = Math.max(28, Math.round(dragState.originalWidth + event.clientX - dragState.startX));
        const height = Math.max(24, Math.round(dragState.originalHeight + event.clientY - dragState.startY));
        setDragState({ ...dragState, currentWidth: width, currentHeight: height });
        previewNode(dragState.nodeId, { width, height });
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
  }, [activeWireframe?.nodes, commitNodeDrag, dragState, endProjectHistoryGroup, previewNode]);

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
        if (droppedOnCanvas && rect) {
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
  }, [addNode, paletteDrag]);

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
      if (modifier && event.key.toLowerCase() === "c" && !isEditingText) {
        event.preventDefault();
        copyNode();
      }
      if (modifier && event.key.toLowerCase() === "x" && !isEditingText) {
        event.preventDefault();
        cutNode();
      }
      if (modifier && event.key.toLowerCase() === "v" && !isEditingText) {
        event.preventDefault();
        pasteNode();
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
          layerNode(selectedId, action);
        }
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
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
        setSelectedId(null);
      }
      if (selectedId && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        if (target?.closest("input, textarea, select")) return;
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const node = activeWireframe?.nodes.find((item) => item.id === selectedId);
        if (!node) return;
        updateNode(selectedId, {
          x: Math.max(0, node.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0)),
          y: Math.max(0, node.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0)),
        });
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
    layerNode,
    lockNode,
    pasteNode,
    redoProjectChange,
    saveProject,
    selectNone,
    selectedId,
    textEditor,
    undoProjectChange,
    unlockAllNodes,
    updateNode,
  ]);

  const addWireframe = () => {
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      activeWireframeId: id,
      wireframes: [...current.wireframes, { id, name: `Wireframe ${current.wireframes.length + 1}`, nodes: [] }],
    }));
    setSelectedId(null);
  };

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
          name: `${sourceWireframe.name} copy`,
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

  const canvasPointFromEvent = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: Math.round(event.clientX - (rect?.left ?? 0)),
      y: Math.round(event.clientY - (rect?.top ?? 0)),
    };
  };

  const openCanvasContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    const point = canvasPointFromEvent(event);
    const stack = [...(activeWireframe?.nodes ?? [])].filter((node) => pointHitsNode(point.x, point.y, node)).reverse();
    const targetId = selectedId && stack.some((node) => node.id === selectedId) ? selectedId : stack[0]?.id ?? null;
    if (targetId) setSelectedId(targetId);
    setContextMenu({ x: event.clientX, y: event.clientY, canvasX: point.x, canvasY: point.y, targetId, stack });
  };

  const contextTargetName = contextMenu?.targetId
    ? activeWireframe?.nodes.find((node) => node.id === contextMenu.targetId)?.name ?? "Object"
    : "Canvas";
  const projectDisplayName = projectPath ? projectNameFromPath(projectPath) : "Unsaved Project";

  return (
    <div className="app-shell">
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
          <strong className={dirty ? "save-state is-dirty" : "save-state"}>
            {dirty ? "Unsaved changes" : projectPath ? "Saved" : "Not saved"}
          </strong>
        </div>
        <div className="titlebar-actions">
          <button
            type="button"
            onClick={newProject}
            title="New project"
          >
            <FilePlus2 size={16} />
          </button>
          <button type="button" onClick={openProject} title="Open project">
            <FolderOpen size={16} />
          </button>
          <button type="button" onClick={() => void saveProject(false)} title="Save project">
            <Save size={16} />
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

      <main className={`workspace${leftCollapsed ? " left-collapsed" : ""}${rightCollapsed ? " right-collapsed" : ""}`}>
        {leftCollapsed ? null : (
        <aside className="left-pane">
          <button
            type="button"
            className="project-properties-row"
            onClick={() => {
              setSelectedId(null);
              setSettingsOpen(true);
            }}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
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
                  onClick={() => {
                    if (suppressNextLibraryClickRef.current) return;
                    addNode(definition.kind);
                  }}
                  onPointerDown={(event) => {
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

          <div className="canvas-scroll">
            <div
              ref={canvasRef}
              className="canvas"
              onClick={(event) => {
                if (event.target === event.currentTarget) setSelectedId(null);
                setContextMenu(null);
                setTextEditor(null);
              }}
              onContextMenu={openCanvasContextMenu}
            >
              {snapGuides.map((x, index) => (
                <div key={`guide-${index}-${x}`} className="snap-guide" style={{ left: x }} />
              ))}
              {activeWireframe?.nodes.map((node) => (
                <CanvasItem
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  onSelect={() => setSelectedId(node.id)}
                  onTextEdit={() => beginTextEdit(node)}
                  onUpdate={(patch) => updateNode(node.id, patch)}
                  onMoveStart={(event) => {
                    if (node.locked) return;
                    event.stopPropagation();
                    setSelectedId(node.id);
                    setDragState({
                      kind: "move",
                      nodeId: node.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalX: node.x,
                      originalY: node.y,
                      currentX: node.x,
                      currentY: node.y,
                    });
                  }}
                  onResizeStart={(event) => {
                    event.stopPropagation();
                    setSelectedId(node.id);
                    setDragState({
                      kind: "resize",
                      nodeId: node.id,
                      startX: event.clientX,
                      startY: event.clientY,
                      originalWidth: node.width,
                      originalHeight: node.height,
                      currentWidth: node.width,
                      currentHeight: node.height,
                    });
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {rightCollapsed ? null : (
          <aside className="right-pane">
            <PropertiesPane
              selectedNode={selectedNode}
              onNodeChange={(patch, options) => selectedNode && updateNode(selectedNode.id, patch, options)}
              onNodeChangeEnd={endProjectHistoryGroup}
              onLayer={(action) => layerNode(selectedId, action)}
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
          canPaste={Boolean(clipboard)}
          onClose={() => setContextMenu(null)}
          onSelect={(id) => {
            setSelectedId(id);
            setContextMenu((current) => (current ? { ...current, targetId: id } : current));
          }}
          onCut={() => cutNode(contextMenu.targetId)}
          onCopy={() => copyNode(contextMenu.targetId)}
          onPaste={() => pasteNode(contextMenu.canvasX, contextMenu.canvasY)}
          onDelete={() => deleteNode(contextMenu.targetId)}
          onLayer={(action) => layerNode(contextMenu.targetId, action)}
        />
      ) : null}
      {wireframeContextMenu ? (
        <WireframeContextMenu
          state={wireframeContextMenu}
          canDelete={Boolean(wireframeContextMenu.wireframeId) && project.wireframes.length > 1}
          canDuplicate={Boolean(wireframeContextMenu.wireframeId)}
          onClose={() => setWireframeContextMenu(null)}
          onNew={addWireframe}
          onDuplicate={() => wireframeContextMenu.wireframeId && duplicateWireframe(wireframeContextMenu.wireframeId)}
          onDelete={() => wireframeContextMenu.wireframeId && deleteWireframe(wireframeContextMenu.wireframeId)}
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
          onChange={(draft) => setTextEditor((current) => (current ? { ...current, draft } : current))}
          onCommit={() => closeTextEditor(true)}
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
  onSelect,
  onUpdate,
  onTextEdit,
  onMoveStart,
  onResizeStart,
}: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<CanvasNode>) => void;
  onTextEdit: () => void;
  onMoveStart: (event: React.PointerEvent) => void;
  onResizeStart: (event: React.PointerEvent) => void;
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
  } as React.CSSProperties;

  return (
    <div
      className={`canvas-node node-${node.kind}${selected ? " is-selected" : ""}${node.locked ? " is-locked" : ""}`}
      style={style}
      onPointerDown={onMoveStart}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onTextEdit();
      }}
    >
      <NodeContent node={node} onUpdate={onUpdate} />
      {selected ? (
        <>
          <span className="selection-handle handle-nw" />
          <span className="selection-handle handle-n" />
          <span className="selection-handle handle-ne" />
          <span className="selection-handle handle-e" />
          <span className="selection-handle handle-se" onPointerDown={onResizeStart} />
          <span className="selection-handle handle-s" />
          <span className="selection-handle handle-sw" />
          <span className="selection-handle handle-w" />
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

function NodeContent({ node, onUpdate }: { node: CanvasNode; onUpdate: (patch: Partial<CanvasNode>) => void }) {
  if (["button", "circleButton", "pointyButton", "multilineButton", "helpButton"].includes(node.kind)) return <ButtonVisual node={node} />;
  if (["text", "textLabel", "textTitle", "textSubtitle", "textParagraph", "link", "squigglyParagraph"].includes(node.kind)) return <TextVisual node={node} />;
  if (["checkbox", "checkboxList", "radioButton", "radioButtonGroup", "dropdown", "comboBox", "textbox", "textInput", "textArea", "searchBox", "searchBoxVoice", "colorPicker", "numericStepper", "onOffSwitch", "progressBar", "progressBarIndeterminate"].includes(node.kind)) {
    return <FormVisual node={node} onUpdate={onUpdate} />;
  }
  if (["tabs", "buttonBar", "tabBar", "vTabs", "linkBar", "breadcrumbs", "menuBar", "menu", "appBar", "playback", "toolbar"].includes(node.kind)) return <NavigationVisual node={node} />;
  if (["accordion", "alertBox", "browser", "window", "modalScreen", "fieldSet", "popover", "tooltip", "callout"].includes(node.kind)) return <ContainerVisual node={node} />;
  if (["list", "listIcon", "treePane", "dataGrid", "calendar", "dateChooser", "datePicker", "timePicker", "siteMap", "streetMap", "tagCloud"].includes(node.kind)) return <DataVisual node={node} />;
  if (["chartBar", "chartColumn", "chartLine", "chartPie", "hScrollBar", "vScrollBar", "hSlider", "vSlider", "volumeSlider"].includes(node.kind)) return <ChartVisual node={node} />;
  if (["arrow", "hRule", "vRule", "hSplitter", "vSplitter", "redX", "scratchOut", "squigglyLine", "hCurlyBrace", "vCurlyBrace", "shape"].includes(node.kind)) return <MarkupVisual node={node} />;
  if (["icon", "iconText", "image", "webcam", "videoPlayer", "coverFlow", "smartphone", "iphone", "ipad", "iosKeyboard", "iosMenu", "iosPicker"].includes(node.kind)) return <MediaVisual node={node} />;
  if (node.kind === "stickyNote") return <div className="editable-node-text">{node.text}</div>;
  return null;
}

function ButtonVisual({ node }: { node: CanvasNode }) {
  const className = `button-node visual-button visual-button-${node.kind}`;
  return (
    <div className={className}>
      <span>{node.text}</span>
    </div>
  );
}

function TextVisual({ node }: { node: CanvasNode }) {
  const text = node.text ?? "";
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
  return <div className={`editable-node-text text-visual text-visual-${node.kind}`}>{text}</div>;
}

function FormVisual({ node, onUpdate }: { node: CanvasNode; onUpdate: (patch: Partial<CanvasNode>) => void }) {
  if (node.kind === "checkbox") {
    return (
      <label className="checkbox-node">
        <input type="checkbox" checked={Boolean(node.checked)} onChange={(event) => onUpdate({ checked: event.target.checked })} />
        <span>{node.text}</span>
      </label>
    );
  }
  if (node.kind === "radioButton") {
    return (
      <label className="radio-node">
        <span className={node.checked ? "radio-dot is-checked" : "radio-dot"} />
        <span>{node.text}</span>
      </label>
    );
  }
  if (node.kind === "checkboxList" || node.kind === "radioButtonGroup") {
    return (
      <div className="checkbox-list-node">
        {nodeOptions(node, ["Option one", "Option two", "Option three"]).map((option, index) => (
          <label key={`${option}-${index}`}>
            {node.kind === "radioButtonGroup" ? <span className={index === 0 ? "radio-dot is-checked" : "radio-dot"} /> : <input type="checkbox" defaultChecked={index === 1} />}
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (node.kind === "dropdown" || node.kind === "comboBox") {
    return (
      <div className="dropdown-node">
        <span>{node.text}</span>
        <ChevronDown size={16} />
      </div>
    );
  }
  if (node.kind === "textbox" || node.kind === "textInput") return <div className="textbox-node">{node.text || node.placeholder}</div>;
  if (node.kind === "textArea") return <div className="textarea-node">{node.text}</div>;
  if (node.kind === "searchBox" || node.kind === "searchBoxVoice") {
    return (
      <div className="search-node">
        <Search size={14} />
        <span>{node.text || node.placeholder}</span>
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

function NavigationVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "tabs") return <Segmented items={nodeOptions(node)} activeIndex={node.activeIndex ?? 0} />;
  if (node.kind === "buttonBar") return <Segmented items={nodeOptions(node)} activeIndex={node.activeIndex ?? 0} compact />;
  if (node.kind === "tabBar") return <Segmented items={nodeOptions(node)} activeIndex={node.activeIndex ?? 0} />;
  if (node.kind === "vTabs") return <div className="v-tabs-node">{nodeOptions(node).map((item, index) => <span key={item} className={index === (node.activeIndex ?? 0) ? "is-active" : ""}>{item}</span>)}</div>;
  if (node.kind === "linkBar" || node.kind === "breadcrumbs") return <div className={`linkbar-node ${node.kind}`}>{nodeOptions(node).map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}</div>;
  if (node.kind === "menuBar") return <div className="menu-bar-node">{nodeOptions(node).map((item) => <span key={item}>{item}</span>)}</div>;
  if (node.kind === "menu") return <div className="menu-node">{nodeOptions(node).map((item) => <span key={item}>{item}</span>)}</div>;
  if (node.kind === "appBar") return <div className="app-bar-node"><span>{node.text}</span><small>▾</small></div>;
  if (node.kind === "playback") return <div className="playback-node"><span>◀◀</span><span>▶</span><span>▶▶</span></div>;
  if (node.kind === "toolbar") return <div className="toolbar-node">{nodeOptions(node).map((item) => <span key={item}>{item}</span>)}</div>;
  return null;
}

function ContainerVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "accordion") return <div className="accordion-node">{nodeOptions(node).map((item, index) => <span key={item} className={index === 0 ? "is-open" : ""}>{item}</span>)}</div>;
  if (node.kind === "alertBox") return <div className="alert-node"><strong>Alert</strong><p>{node.text}</p><div>{nodeOptions(node, ["No", "Yes"]).map((item) => <span key={item}>{item}</span>)}</div></div>;
  if (node.kind === "browser" || node.kind === "window") return <ChromeFrame node={node} />;
  if (node.kind === "modalScreen") return <div className="modal-screen-node" />;
  if (node.kind === "fieldSet") return <fieldset className="fieldset-node"><legend>{node.text}</legend></fieldset>;
  if (node.kind === "popover") return <div className="popover-node"><span />{node.text}</div>;
  if (node.kind === "tooltip") return <div className="tooltip-node">{node.text}</div>;
  if (node.kind === "callout") return <div className="callout-node">{node.text}</div>;
  return null;
}

function ChromeFrame({ node }: { node: CanvasNode }) {
  return (
    <div className="chrome-frame-node">
      <div><span /><span /><span /><strong>{node.text}</strong></div>
      <section />
    </div>
  );
}

function DataVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "list" || node.kind === "listIcon" || node.kind === "treePane") return <div className={`list-node ${node.kind}`}>{nodeOptions(node).map((item) => <span key={item}>{node.kind === "listIcon" ? "◆ " : ""}{item}</span>)}</div>;
  if (node.kind === "dataGrid") return <DataGridVisual node={node} />;
  if (node.kind === "calendar" || node.kind === "datePicker") return <CalendarVisual node={node} />;
  if (node.kind === "dateChooser") return <div className="date-chooser-node">{node.text}<span>▣</span></div>;
  if (node.kind === "timePicker") return <div className="time-picker-node"><span>{node.text}</span><i /></div>;
  if (node.kind === "siteMap") return <SiteMapVisual node={node} />;
  if (node.kind === "streetMap") return <div className="street-map-node"><span /><span /><span /></div>;
  if (node.kind === "tagCloud") return <div className="tag-cloud-node">{(node.text ?? "").split(/\s+/).map((word, index) => <span key={`${word}-${index}`}>{word}</span>)}</div>;
  return null;
}

function DataGridVisual({ node }: { node: CanvasNode }) {
  const columns = node.columns?.length ? node.columns : ["Name", "Role", "Status"];
  const rows = node.rows?.length ? node.rows : ["Alice|PM|Active", "Ben|Design|Review"];
  return (
    <table className="data-grid-node">
      <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
      <tbody>{rows.map((row, rowIndex) => <tr key={`${row}-${rowIndex}`}>{columns.map((_, index) => <td key={index}>{row.split("|")[index] ?? ""}</td>)}</tr>)}</tbody>
    </table>
  );
}

function CalendarVisual({ node }: { node: CanvasNode }) {
  return <div className="calendar-node"><strong>{node.text}</strong>{Array.from({ length: 35 }, (_, index) => <span key={index}>{index > 4 ? index - 4 : ""}</span>)}</div>;
}

function SiteMapVisual({ node }: { node: CanvasNode }) {
  const items = nodeOptions(node);
  return <div className="site-map-node"><strong>{items[0]}</strong>{items.slice(1).map((item) => <span key={item}>{item}</span>)}</div>;
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
  if (node.kind === "hCurlyBrace" || node.kind === "vCurlyBrace") return <div className={`curly-node ${node.kind}`}><span>{node.kind === "hCurlyBrace" ? "︷" : "}"}</span><small>{node.text}</small></div>;
  if (node.kind === "shape") return <div className="shape-node" />;
  return null;
}

function MediaVisual({ node }: { node: CanvasNode }) {
  if (node.kind === "icon") {
    const Icon = getLucideIcon(node.icon);
    return <Icon className="icon-node" size={Math.max(12, Math.min(node.width, node.height) - 14)} />;
  }
  if (node.kind === "iconText") {
    const Icon = getLucideIcon(node.icon);
    return <div className="icon-text-node"><Icon size={Math.max(22, Math.min(node.width, node.height) / 2)} /><span>{node.text}</span></div>;
  }
  if (node.kind === "image") return <div className="image-node"><span /><span /></div>;
  if (node.kind === "webcam") return <div className="webcam-node"><span /><i /></div>;
  if (node.kind === "videoPlayer") return <div className="video-node"><section /><footer><span /><b /></footer></div>;
  if (node.kind === "coverFlow") return <div className="coverflow-node"><span /><span /><span /></div>;
  if (node.kind === "smartphone" || node.kind === "iphone" || node.kind === "ipad") return <DeviceVisual node={node} />;
  if (node.kind === "iosKeyboard") return <div className="ios-keyboard-node">{Array.from({ length: 30 }, (_, index) => <span key={index}>{index === 26 ? "space" : ""}</span>)}</div>;
  if (node.kind === "iosMenu") return <div className="ios-menu-node">{nodeOptions(node).map((item) => <span key={item}>{item}</span>)}</div>;
  if (node.kind === "iosPicker") return <div className="ios-picker-node">{nodeOptions(node).map((item) => <span key={item}>{item}</span>)}</div>;
  return null;
}

function DeviceVisual({ node }: { node: CanvasNode }) {
  return <div className={`device-node ${node.kind}`}><span /><section /></div>;
}

function Segmented({ items, activeIndex, compact = false }: { items: string[]; activeIndex: number; compact?: boolean }) {
  return (
    <div className={compact ? "segmented compact" : "segmented"}>
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className={index === activeIndex ? "is-active" : ""}>
          {item}
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
  onCommit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  }, [editor.nodeId, editor.field]);

  return (
    <div
      className={editor.multiline ? "floating-text-editor is-multiline" : "floating-text-editor"}
      style={{ left: editor.x, top: editor.y, width: editor.width, minHeight: editor.height }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={editor.draft}
        rows={editor.multiline ? 6 : 1}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onCommit();
          }
        }}
      />
      <span className="floating-text-count">{editor.draft.length}</span>
    </div>
  );
}

function PropertiesPane({
  selectedNode,
  onNodeChange,
  onNodeChangeEnd,
  onLayer,
}: {
  selectedNode: CanvasNode | null;
  onNodeChange: (patch: Partial<CanvasNode>, options?: ProjectChangeOptions) => void;
  onNodeChangeEnd: () => void;
  onLayer: (action: "front" | "back" | "forward" | "backward") => void;
}) {
  if (!selectedNode) return <div className="properties is-empty" />;

  const groupedChange = (property: keyof CanvasNode, patch: Partial<CanvasNode>) => {
    onNodeChange(patch, { groupKey: `property:${selectedNode.id}:${property}` });
  };

  return (
    <div className="properties">
      <h2>{selectedNode.name}</h2>
      <div className="property-grid">
        <label>
          X
          <input type="number" value={selectedNode.x} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("x", { x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={selectedNode.y} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("y", { y: Number(event.target.value) })} />
        </label>
        <label>
          W
          <input type="number" value={selectedNode.width} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("width", { width: Number(event.target.value) })} />
        </label>
        <label>
          H
          <input type="number" value={selectedNode.height} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("height", { height: Number(event.target.value) })} />
        </label>
      </div>
      <div className="layer-buttons">
        <button type="button" onClick={() => onLayer("back")} title="Send to back"><SendToBack size={16} /></button>
        <button type="button" onClick={() => onLayer("backward")} title="Send backward"><SendToBack size={16} /></button>
        <button type="button" onClick={() => onLayer("forward")} title="Bring forward"><BringToFront size={16} /></button>
        <button type="button" onClick={() => onLayer("front")} title="Bring to front"><BringToFront size={16} /></button>
      </div>
      <label>
        Fill
        <input type="color" value={selectedNode.fill ?? "#ffffff"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("fill", { fill: event.target.value })} />
      </label>
      <label>
        Stroke
        <input type="color" value={selectedNode.stroke ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("stroke", { stroke: event.target.value })} />
      </label>
      <label>
        Text Color
        <input type="color" value={selectedNode.textColor ?? "#111827"} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("textColor", { textColor: event.target.value })} />
      </label>
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
          Text
          <textarea value={selectedNode.text ?? ""} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("text", { text: event.target.value })} />
        </label>
      ) : null}
      {selectedNode.options ? (
        <label>
          Options
          <textarea value={selectedNode.options.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("options", { options: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.columns ? (
        <label>
          Columns
          <textarea value={selectedNode.columns.join("\n")} onBlur={onNodeChangeEnd} onChange={(event) => groupedChange("columns", { columns: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.rows ? (
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
  onClose,
  onNew,
  onDuplicate,
  onDelete,
}: {
  state: WireframeContextMenuState;
  canDelete: boolean;
  canDuplicate: boolean;
  onClose: () => void;
  onNew: () => void;
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
