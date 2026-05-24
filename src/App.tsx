import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  AlignLeft,
  BringToFront,
  CheckSquare,
  ChevronDown,
  Clipboard,
  FilePlus2,
  FolderOpen,
  Layers,
  MousePointer2,
  PanelRight,
  Plus,
  Save,
  SendToBack,
  Square,
  StickyNote,
  Trash2,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openProjectFile, saveProjectFile } from "./lib/mockupsApi";
import type { CanvasNode, ComponentDefinition, ComponentKind, MockupProject, Wireframe } from "./types";

const projectPathKey = "mockups-last-project-path";
const themeKey = "mockups-theme";
const accentKey = "mockups-accent";
const appFontSizeKey = "mockups-app-font-size";
const appFontFamilyKey = "mockups-app-font-family";
const accentTitlebarKey = "mockups-accent-titlebar";

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

type DragState =
  | { kind: "move"; nodeId: string; startX: number; startY: number; originalX: number; originalY: number }
  | { kind: "resize"; nodeId: string; startX: number; startY: number; originalWidth: number; originalHeight: number };

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

function App() {
  const [projectPath, setProjectPath] = useState<string | null>(() => localStorage.getItem(projectPathKey));
  const [project, setProject] = useState<MockupProject>(() => {
    const project = createDefaultProject();
    project.appearance.colorScheme = (localStorage.getItem(themeKey) as MockupProject["appearance"]["colorScheme"]) || project.appearance.colorScheme;
    project.appearance.accentColor = localStorage.getItem(accentKey) || project.appearance.accentColor;
    project.appearance.appFontFamily = localStorage.getItem(appFontFamilyKey) || project.appearance.appFontFamily;
    project.appearance.appFontSize = Number(localStorage.getItem(appFontSizeKey)) || project.appearance.appFontSize;
    project.appearance.accentTitlebar = localStorage.getItem(accentTitlebarKey) === "true";
    return project;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<CanvasNode | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("Ready");
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const activeWireframe = useMemo(
    () => project.wireframes.find((wireframe) => wireframe.id === project.activeWireframeId) ?? project.wireframes[0],
    [project.activeWireframeId, project.wireframes],
  );
  const selectedNode = activeWireframe?.nodes.find((node) => node.id === selectedId) ?? null;

  useEffect(() => {
    document.documentElement.dataset.theme = project.appearance.colorScheme;
    document.documentElement.style.setProperty("--accent", project.appearance.accentColor);
    document.documentElement.style.setProperty("--app-font-family", project.appearance.appFontFamily);
    document.documentElement.style.setProperty("--app-font-size", `${project.appearance.appFontSize}px`);
    localStorage.setItem(themeKey, project.appearance.colorScheme);
    localStorage.setItem(accentKey, project.appearance.accentColor);
    localStorage.setItem(appFontFamilyKey, project.appearance.appFontFamily);
    localStorage.setItem(appFontSizeKey, String(project.appearance.appFontSize));
    localStorage.setItem(accentTitlebarKey, String(project.appearance.accentTitlebar));
  }, [project.appearance]);

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

  const saveProject = useCallback(
    async (saveAs = false) => {
      let nextPath = projectPath;
      if (!nextPath || saveAs) {
        const chosen = await saveDialog({
          title: "Save Mockups Project",
          defaultPath: `${project.name || "New Project"}.dsmockup`,
          filters: [{ name: "Mockups Project", extensions: ["dsmockup", "json"] }],
        });
        if (!chosen) return;
        nextPath = chosen;
      }
      await saveProjectFile(nextPath, project);
      setProjectPath(nextPath);
      localStorage.setItem(projectPathKey, nextPath);
      setDirty(false);
      setStatus(`Saved ${project.name}`);
    },
    [project, projectPath],
  );

  const openProject = useCallback(async () => {
    const chosen = await openDialog({
      title: "Open Mockups Project",
      multiple: false,
      filters: [{ name: "Mockups Project", extensions: ["dsmockup", "json"] }],
    });
    if (!chosen || Array.isArray(chosen)) return;
    const loaded = await openProjectFile(chosen);
    setProject(loaded);
    setProjectPath(chosen);
    localStorage.setItem(projectPathKey, chosen);
    setSelectedId(null);
    setDirty(false);
    setStatus(`Opened ${loaded.name}`);
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!dragState) return;
      event.preventDefault();
      if (dragState.kind === "move") {
        updateNode(dragState.nodeId, {
          x: Math.max(0, Math.round(dragState.originalX + event.clientX - dragState.startX)),
          y: Math.max(0, Math.round(dragState.originalY + event.clientY - dragState.startY)),
        });
      } else {
        updateNode(dragState.nodeId, {
          width: Math.max(28, Math.round(dragState.originalWidth + event.clientX - dragState.startX)),
          height: Math.max(24, Math.round(dragState.originalHeight + event.clientY - dragState.startY)),
        });
      }
    };
    const onPointerUp = () => setDragState(null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragState, updateNode]);

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
  }, [activeWireframe?.nodes, copyNode, cutNode, deleteNode, pasteNode, saveProject, selectedId, updateNode]);

  const addWireframe = () => {
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      activeWireframeId: id,
      wireframes: [...current.wireframes, { id, name: `Wireframe ${current.wireframes.length + 1}`, nodes: [] }],
    }));
    setSelectedId(null);
  };

  const duplicateWireframe = () => {
    if (!activeWireframe) return;
    const id = createId("wireframe");
    mutateProject((current) => ({
      ...current,
      activeWireframeId: id,
      wireframes: [
        ...current.wireframes,
        {
          id,
          name: `${activeWireframe.name} copy`,
          nodes: activeWireframe.nodes.map((node) => ({ ...node, id: createId("node"), x: node.x + 20, y: node.y + 20 })),
        },
      ],
    }));
    setSelectedId(null);
  };

  const deleteWireframe = () => {
    if (!activeWireframe || project.wireframes.length === 1) return;
    mutateProject((current) => {
      const nextWireframes = current.wireframes.filter((wireframe) => wireframe.id !== activeWireframe.id);
      return { ...current, wireframes: nextWireframes, activeWireframeId: nextWireframes[0].id };
    });
    setSelectedId(null);
  };

  const canvasPointFromEvent = (event: React.DragEvent | React.MouseEvent) => {
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

  return (
    <div className="app-shell">
      <header className={project.appearance.accentTitlebar ? "app-titlebar is-accented" : "app-titlebar"}>
        <div className="project-title">
          <span>{project.name}</span>
          {dirty ? <strong>Edited</strong> : null}
        </div>
        <div className="titlebar-actions">
          <button type="button" onClick={() => setProject(createDefaultProject())} title="New project">
            <FilePlus2 size={16} />
          </button>
          <button type="button" onClick={openProject} title="Open project">
            <FolderOpen size={16} />
          </button>
          <button type="button" onClick={() => void saveProject(false)} title="Save project">
            <Save size={16} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="left-pane">
          <div className="pane-header">
            <h2>Wireframes</h2>
            <button type="button" onClick={addWireframe} title="Add wireframe">
              <Plus size={16} />
            </button>
          </div>
          <div className="wireframe-list">
            {project.wireframes.map((wireframe) => (
              <button
                key={wireframe.id}
                type="button"
                className={wireframe.id === activeWireframe?.id ? "wireframe-row is-active" : "wireframe-row"}
                onClick={() => {
                  mutateProject((current) => ({ ...current, activeWireframeId: wireframe.id }));
                  setSelectedId(null);
                }}
              >
                <span>{wireframe.name}</span>
                <small>{wireframe.nodes.length}</small>
              </button>
            ))}
          </div>
          <div className="wireframe-actions">
            <button type="button" onClick={duplicateWireframe}>Duplicate</button>
            <button type="button" onClick={deleteWireframe} disabled={project.wireframes.length === 1}>Delete</button>
          </div>
        </aside>

        <section className="center-pane">
          <div className="component-library">
            {componentLibrary.map((definition) => {
              const Icon = iconMap[definition.icon] ?? Square;
              return (
                <button
                  key={definition.kind}
                  type="button"
                  className="library-item"
                  draggable
                  onClick={() => addNode(definition.kind)}
                  onDragStart={(event) => event.dataTransfer.setData("application/x-component-kind", definition.kind)}
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
              }}
              onContextMenu={openCanvasContextMenu}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const kind = event.dataTransfer.getData("application/x-component-kind") as ComponentKind;
                if (!kind) return;
                const point = canvasPointFromEvent(event);
                addNode(kind, point.x, point.y);
              }}
            >
              {activeWireframe?.nodes.map((node) => (
                <CanvasItem
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  onSelect={() => setSelectedId(node.id)}
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

        <aside className="right-pane">
          <PropertiesPane
            project={project}
            selectedNode={selectedNode}
            onProjectChange={(patch) => mutateProject((current) => ({ ...current, ...patch }))}
            onAppearanceChange={(appearance) => mutateProject((current) => ({ ...current, appearance: { ...current.appearance, ...appearance } }))}
            onNodeChange={(patch) => selectedNode && updateNode(selectedNode.id, patch)}
            onLayer={(action) => layerNode(selectedId, action)}
          />
        </aside>
      </main>

      <footer className="statusbar">
        <span>{projectPath ?? "Unsaved project"}</span>
        <span>{status}</span>
      </footer>

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
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
    </div>
  );
}

function CanvasItem({
  node,
  selected,
  onSelect,
  onUpdate,
  onMoveStart,
  onResizeStart,
}: {
  node: CanvasNode;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<CanvasNode>) => void;
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
    >
      <NodeContent node={node} onUpdate={onUpdate} />
      {selected ? <span className="resize-handle" onPointerDown={onResizeStart} /> : null}
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
    const Icon = node.icon === "CheckSquare" ? CheckSquare : node.icon === "Trash2" ? Trash2 : Plus;
    return <Icon className="icon-node" size={Math.min(node.width, node.height) - 14} />;
  }
  if (node.kind === "text" || node.kind === "stickyNote") {
    return (
      <textarea
        className="editable-node-text"
        value={node.text ?? ""}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => onUpdate({ text: event.target.value })}
      />
    );
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

function PropertiesPane({
  project,
  selectedNode,
  onProjectChange,
  onAppearanceChange,
  onNodeChange,
  onLayer,
}: {
  project: MockupProject;
  selectedNode: CanvasNode | null;
  onProjectChange: (patch: Partial<MockupProject>) => void;
  onAppearanceChange: (patch: Partial<MockupProject["appearance"]>) => void;
  onNodeChange: (patch: Partial<CanvasNode>) => void;
  onLayer: (action: "front" | "back" | "forward" | "backward") => void;
}) {
  return (
    <div className="properties">
      <h2>{selectedNode ? selectedNode.name : "Project"}</h2>
      {!selectedNode ? (
        <>
          <label>
            Project Name
            <input value={project.name} onChange={(event) => onProjectChange({ name: event.target.value })} />
          </label>
          <label>
            Theme
            <select value={project.appearance.colorScheme} onChange={(event) => onAppearanceChange({ colorScheme: event.target.value as never })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Accent
            <input type="color" value={project.appearance.accentColor} onChange={(event) => onAppearanceChange({ accentColor: event.target.value })} />
          </label>
          <label>
            App Font Size
            <input
              type="number"
              min={12}
              max={18}
              value={project.appearance.appFontSize}
              onChange={(event) => onAppearanceChange({ appFontSize: Number(event.target.value) })}
            />
          </label>
          <label className="checkbox-setting">
            <input
              type="checkbox"
              checked={project.appearance.accentTitlebar}
              onChange={(event) => onAppearanceChange({ accentTitlebar: event.target.checked })}
            />
            Use accent titlebar
          </label>
        </>
      ) : (
        <>
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
            <label>
              Icon
              <select value={selectedNode.icon ?? "Plus"} onChange={(event) => onNodeChange({ icon: event.target.value })}>
                <option value="Plus">Plus</option>
                <option value="CheckSquare">Check Square</option>
                <option value="Trash2">Trash</option>
              </select>
            </label>
          ) : null}
          <label className="checkbox-setting">
            <input type="checkbox" checked={Boolean(selectedNode.locked)} onChange={(event) => onNodeChange({ locked: event.target.checked })} />
            Locked
          </label>
        </>
      )}
    </div>
  );
}

function ContextMenu({
  state,
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
        {state.stack.length > 1 ? (
          <div className="context-submenu">
            <button type="button">Select</button>
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

export default App;
