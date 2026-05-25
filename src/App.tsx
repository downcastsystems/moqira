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
import { isTauri, openProjectFile, readLastProjectPath, saveProjectFile, syncRecentProjects, writeLastProjectPath } from "./lib/mockupsApi";
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

const componentLibrary: ComponentDefinition[] = [
  { kind: "rectangle", label: "Rectangle", icon: "rectangle", width: 180, height: 110, defaults: { fill: "#ffffff", stroke: "#1f2937" } },
  { kind: "button", label: "Button", icon: "button", width: 112, height: 40, defaults: { text: "Button", fill: "#ffffff" } },
  { kind: "tabs", label: "Tabs", icon: "tabs", width: 260, height: 52, defaults: { options: ["One", "Two", "Three"], activeIndex: 0 } },
  { kind: "buttonBar", label: "Button Bar", icon: "buttonBar", width: 240, height: 40, defaults: { options: ["One", "Two", "Three"], activeIndex: 0 } },
  { kind: "checkbox", label: "Checkbox", icon: "checkbox", width: 150, height: 32, defaults: { text: "Checkbox", checked: false } },
  {
    kind: "checkboxList",
    label: "Checkbox List",
    icon: "checkboxList",
    width: 190,
    height: 118,
    defaults: { options: ["not selected", "selected", "disabled"], text: "Checkbox List" },
  },
  { kind: "icon", label: "Icon", icon: "icon", width: 64, height: 64, defaults: { icon: "Plus", textColor: "#111827" } },
  { kind: "dropdown", label: "Dropdown", icon: "dropdown", width: 180, height: 40, defaults: { text: "Choose...", options: ["First", "Second", "Third"] } },
  { kind: "textbox", label: "Textbox", icon: "textbox", width: 190, height: 40, defaults: { text: "Text input" } },
  { kind: "text", label: "Text", icon: "text", width: 180, height: 42, defaults: { text: "Text label", fontSize: 18, textColor: "#111827" } },
  { kind: "stickyNote", label: "Sticky Note", icon: "stickyNote", width: 180, height: 160, defaults: { text: "A note", fill: "#fff2a8", fontSize: 16 } },
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
  | { kind: "move"; nodeId: string; startX: number; startY: number; originalX: number; originalY: number }
  | { kind: "resize"; nodeId: string; startX: number; startY: number; originalWidth: number; originalHeight: number };

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

function editableTextField(node: CanvasNode): "text" | "options" | null {
  if (node.kind === "checkboxList" || node.kind === "tabs" || node.kind === "buttonBar") return "options";
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

function App() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [project, setProject] = useState<MockupProject>(() => createDefaultProject());
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
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [closePromptOpen, setClosePromptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(() => readRecentProjects());
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
        setProject(restoredProject);
        setProjectPath(loadedProject.rememberedPath);
        setSelectedId(null);
        setDirty(false);
        localStorage.setItem(projectPathKey, loadedProject.rememberedPath);
        void writeLastProjectPath(loadedProject.rememberedPath);
        setRecentProjects((current) => addRecentProject(current, loadedProject.rememberedPath, projectName));
        setStatus(`Opened ${projectName}`);
      })
      .catch((error) => {
        console.warn("Could not reopen last project", error);
        setStatus("Could not reopen last project.");
      });
  }, []);

  const mutateProject = useCallback((updater: (project: MockupProject) => MockupProject) => {
    setProject((current) => updater(current));
    setDirty(true);
  }, []);

  const mutateActiveWireframe = useCallback(
    (updater: (wireframe: Wireframe) => Wireframe) => {
      mutateProject((current) => ({
        ...current,
        wireframes: current.wireframes.map((wireframe) => (wireframe.id === current.activeWireframeId ? updater(wireframe) : wireframe)),
      }));
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
    (id: string, patch: Partial<CanvasNode>) => {
      mutateActiveWireframe((wireframe) => ({
        ...wireframe,
        nodes: wireframe.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)),
      }));
    },
    [mutateActiveWireframe],
  );

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

  const selectWireframe = useCallback((wireframeId: string) => {
    setProject((current) => (current.activeWireframeId === wireframeId ? current : { ...current, activeWireframeId: wireframeId }));
    setSelectedId(null);
  }, []);

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
      setProject(projectToSave);
      setProjectPath(nextPath);
      localStorage.setItem(projectPathKey, nextPath);
      await writeLastProjectPath(nextPath);
      setRecentProjects((current) => addRecentProject(current, nextPath, projectToSave.name));
      setDirty(false);
      setStatus(`Saved to ${nextPath}`);
      setSaveToast(`Saved ${fileNameFromPath(nextPath)}`);
      return true;
    },
    [project, projectPath],
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
    setProject({ ...loaded, name: projectName });
    setProjectPath(chosen);
    localStorage.setItem(projectPathKey, chosen);
    await writeLastProjectPath(chosen);
    setRecentProjects((current) => addRecentProject(current, chosen, projectName));
    setSelectedId(null);
    setDirty(false);
    setStatus(`Opened ${projectName}`);
  }, [confirmLosingUnsavedChanges]);

  const openRecentProject = useCallback(
    async (path: string) => {
      if (!confirmLosingUnsavedChanges()) return;
      try {
        const loaded = await openProjectFile(path);
        const projectName = projectNameFromPath(path);
        setProject({ ...loaded, name: projectName });
        setProjectPath(path);
        localStorage.setItem(projectPathKey, path);
        await writeLastProjectPath(path);
        setRecentProjects((current) => addRecentProject(current, path, projectName));
        setSelectedId(null);
        setDirty(false);
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
    [confirmLosingUnsavedChanges],
  );

  const newProject = useCallback(() => {
    if (!confirmLosingUnsavedChanges()) return;
    setProject(createDefaultProject());
    setProjectPath(null);
    setSelectedId(null);
    setDirty(false);
    setStatus("Created new project");
  }, [confirmLosingUnsavedChanges]);

  useEffect(() => {
    if (!isTauri()) return;
    const cleanups: Array<() => void> = [];

    void listen("menu-new-project", () => newProject()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-open-project", () => void openProject()).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-save-project", () => void saveProject(false)).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-save-project-as", () => void saveProject(true)).then((cleanup) => cleanups.push(cleanup));
    void listen("menu-open-settings", () => {
      setSelectedId(null);
      setSettingsOpen(true);
    }).then((cleanup) => cleanups.push(cleanup));
    void listen<string>("menu-open-recent-project", (event) => void openRecentProject(event.payload)).then((cleanup) => cleanups.push(cleanup));

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [newProject, openProject, openRecentProject, saveProject]);

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
        updateNode(dragState.nodeId, { x: finalX, y: rawY });
      } else {
        updateNode(dragState.nodeId, {
          width: Math.max(28, Math.round(dragState.originalWidth + event.clientX - dragState.startX)),
          height: Math.max(24, Math.round(dragState.originalHeight + event.clientY - dragState.startY)),
        });
      }
    };
    const onPointerUp = () => {
      setDragState(null);
      setSnapGuides([]);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeWireframe?.nodes, dragState, updateNode]);

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
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
      if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copyNode();
      }
      if (modifier && event.key.toLowerCase() === "x") {
        event.preventDefault();
        cutNode();
      }
      if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteNode();
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        const target = event.target as HTMLElement | null;
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
        const target = event.target as HTMLElement | null;
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
  }, [activeWireframe?.nodes, closeTextEditor, copyNode, cutNode, deleteNode, pasteNode, saveProject, selectedId, textEditor, updateNode]);

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
          <div className="component-library">
            {componentLibrary.map((definition) => {
              const Icon = iconMap[definition.icon] ?? Square;
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
                    setDragState({ kind: "move", nodeId: node.id, startX: event.clientX, startY: event.clientY, originalX: node.x, originalY: node.y });
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
              onNodeChange={(patch) => selectedNode && updateNode(selectedNode.id, patch)}
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

function NodeContent({ node, onUpdate }: { node: CanvasNode; onUpdate: (patch: Partial<CanvasNode>) => void }) {
  if (node.kind === "button") return <div className="button-node">{node.text}</div>;
  if (node.kind === "tabs") return <Segmented items={node.options ?? []} activeIndex={node.activeIndex ?? 0} />;
  if (node.kind === "buttonBar") return <Segmented items={node.options ?? []} activeIndex={node.activeIndex ?? 0} compact />;
  if (node.kind === "checkbox") {
    return (
      <label className="checkbox-node">
        <input type="checkbox" checked={Boolean(node.checked)} onChange={(event) => onUpdate({ checked: event.target.checked })} />
        <span>{node.text}</span>
      </label>
    );
  }
  if (node.kind === "checkboxList") {
    return (
      <div className="checkbox-list-node">
        {(node.options ?? []).map((option, index) => (
          <label key={`${option}-${index}`}>
            <input type="checkbox" defaultChecked={index === 1} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }
  if (node.kind === "dropdown") {
    return (
      <div className="dropdown-node">
        <span>{node.text}</span>
        <ChevronDown size={16} />
      </div>
    );
  }
  if (node.kind === "textbox") return <div className="textbox-node">{node.text}</div>;
  if (node.kind === "icon") {
    const Icon = getLucideIcon(node.icon);
    return <Icon className="icon-node" size={Math.min(node.width, node.height) - 14} />;
  }
  if (node.kind === "text" || node.kind === "stickyNote") {
    return <div className="editable-node-text">{node.text}</div>;
  }
  return null;
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
  onLayer,
}: {
  selectedNode: CanvasNode | null;
  onNodeChange: (patch: Partial<CanvasNode>) => void;
  onLayer: (action: "front" | "back" | "forward" | "backward") => void;
}) {
  if (!selectedNode) return <div className="properties is-empty" />;

  return (
    <div className="properties">
      <h2>{selectedNode.name}</h2>
      <div className="property-grid">
        <label>
          X
          <input type="number" value={selectedNode.x} onChange={(event) => onNodeChange({ x: Number(event.target.value) })} />
        </label>
        <label>
          Y
          <input type="number" value={selectedNode.y} onChange={(event) => onNodeChange({ y: Number(event.target.value) })} />
        </label>
        <label>
          W
          <input type="number" value={selectedNode.width} onChange={(event) => onNodeChange({ width: Number(event.target.value) })} />
        </label>
        <label>
          H
          <input type="number" value={selectedNode.height} onChange={(event) => onNodeChange({ height: Number(event.target.value) })} />
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
        <input type="color" value={selectedNode.fill ?? "#ffffff"} onChange={(event) => onNodeChange({ fill: event.target.value })} />
      </label>
      <label>
        Stroke
        <input type="color" value={selectedNode.stroke ?? "#111827"} onChange={(event) => onNodeChange({ stroke: event.target.value })} />
      </label>
      <label>
        Text Color
        <input type="color" value={selectedNode.textColor ?? "#111827"} onChange={(event) => onNodeChange({ textColor: event.target.value })} />
      </label>
      <label>
        Font Size
        <input
          type="number"
          min={8}
          max={72}
          value={selectedNode.fontSize ?? 14}
          onChange={(event) => onNodeChange({ fontSize: Number(event.target.value) })}
        />
      </label>
      {"text" in selectedNode ? (
        <label>
          Text
          <textarea value={selectedNode.text ?? ""} onChange={(event) => onNodeChange({ text: event.target.value })} />
        </label>
      ) : null}
      {selectedNode.options ? (
        <label>
          Options
          <textarea value={selectedNode.options.join("\n")} onChange={(event) => onNodeChange({ options: event.target.value.split("\n") })} />
        </label>
      ) : null}
      {selectedNode.kind === "icon" ? (
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
