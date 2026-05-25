export type ComponentKind =
  | "accordion"
  | "alertBox"
  | "appBar"
  | "arrow"
  | "breadcrumbs"
  | "browser"
  | "rectangle"
  | "button"
  | "tabs"
  | "buttonBar"
  | "calendar"
  | "callout"
  | "chartBar"
  | "chartColumn"
  | "chartLine"
  | "chartPie"
  | "checkbox"
  | "checkboxList"
  | "circleButton"
  | "colorPicker"
  | "comboBox"
  | "coverFlow"
  | "dataGrid"
  | "dateChooser"
  | "datePicker"
  | "fieldSet"
  | "hCurlyBrace"
  | "hRule"
  | "hScrollBar"
  | "hSlider"
  | "hSplitter"
  | "helpButton"
  | "icon"
  | "iconText"
  | "image"
  | "iosKeyboard"
  | "iosMenu"
  | "iosPicker"
  | "ipad"
  | "iphone"
  | "link"
  | "linkBar"
  | "list"
  | "listIcon"
  | "menu"
  | "menuBar"
  | "modalScreen"
  | "multilineButton"
  | "numericStepper"
  | "onOffSwitch"
  | "playback"
  | "pointyButton"
  | "popover"
  | "progressBar"
  | "progressBarIndeterminate"
  | "radioButton"
  | "radioButtonGroup"
  | "redX"
  | "scratchOut"
  | "searchBox"
  | "searchBoxVoice"
  | "shape"
  | "siteMap"
  | "smartphone"
  | "squigglyLine"
  | "squigglyParagraph"
  | "stickyNote"
  | "streetMap"
  | "tabBar"
  | "tagCloud"
  | "textArea"
  | "textInput"
  | "textLabel"
  | "textParagraph"
  | "textSubtitle"
  | "textTitle"
  | "timePicker"
  | "toolbar"
  | "tooltip"
  | "treePane"
  | "vCurlyBrace"
  | "vRule"
  | "vScrollBar"
  | "vSlider"
  | "vSplitter"
  | "vTabs"
  | "videoPlayer"
  | "volumeSlider"
  | "webcam"
  | "window"
  | "dropdown"
  | "textbox"
  | "text";

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
  value?: string | number;
  orientation?: "horizontal" | "vertical";
  variant?: string;
  placeholder?: string;
  columns?: string[];
  rows?: string[];
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
  category?: string;
  width: number;
  height: number;
  defaults?: Partial<CanvasNode>;
};
