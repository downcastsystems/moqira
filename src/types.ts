export type ComponentKind =
  | "rectangle"
  | "button"
  | "tabs"
  | "buttonBar"
  | "checkbox"
  | "checkboxList"
  | "icon"
  | "dropdown"
  | "textbox"
  | "text"
  | "stickyNote";

export type CanvasNode = {
  id: string;
  kind: ComponentKind;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fill?: string;
  stroke?: string;
  textColor?: string;
  fontSize?: number;
  locked?: boolean;
  checked?: boolean;
  options?: string[];
  activeIndex?: number;
  icon?: string;
};

export type Wireframe = {
  id: string;
  name: string;
  nodes: CanvasNode[];
};

export type MockupProject = {
  schemaVersion: 1;
  name: string;
  wireframes: Wireframe[];
  activeWireframeId: string;
  appearance: ProjectAppearance;
};

export type ProjectAppearance = {
  colorScheme: "system" | "light" | "dark";
  accentColor: string;
  appFontFamily: string;
  appFontSize: number;
  accentTitlebar: boolean;
};

export type ProjectFileState = {
  path: string | null;
  project: MockupProject;
  dirty: boolean;
};

export type ComponentDefinition = {
  kind: ComponentKind;
  label: string;
  icon: string;
  width: number;
  height: number;
  defaults?: Partial<CanvasNode>;
};
