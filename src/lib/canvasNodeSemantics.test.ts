import { describe, expect, it } from "vitest";
import { createCanvasNode, linkableElementsForNode, nodePropertyCapabilities } from "./canvasNodeSemantics";

describe("canvasNodeSemantics", () => {
  it("creates label components at a compact default font size", () => {
    expect(createCanvasNode("textLabel", 0, 0, "label").fontSize).toBe(13);
  });

  it("creates radio button components with compact default text and selected-state support", () => {
    const node = createCanvasNode("radioButton", 0, 0, "radio");
    const capabilities = nodePropertyCapabilities(node);

    expect(node.fontSize).toBe(13);
    expect(node.height).toBe(28);
    expect(node.checked).toBe(false);
    expect(capabilities.showGenericState).toBe(true);
    expect(capabilities.genericTextStyle).toBe(true);
  });

  it("exposes icon components as whole-control link targets", () => {
    const icon = createCanvasNode("icon", 0, 0, "icon");
    const iconText = createCanvasNode("iconText", 0, 0, "icon-text");

    expect(icon.stroke).toBe("#111827");
    expect(iconText.stroke).toBe("#111827");
    expect(linkableElementsForNode(icon)).toEqual([
      { key: "whole", label: "Whole Control" },
    ]);
    expect(linkableElementsForNode(iconText)).toEqual([
      { key: "whole", label: "Whole Control" },
    ]);
  });

  it("exposes icon components to generic text styling controls", () => {
    expect(nodePropertyCapabilities(createCanvasNode("icon", 0, 0, "icon")).genericTextStyle).toBe(true);
    expect(nodePropertyCapabilities(createCanvasNode("iconText", 0, 0, "icon-text")).genericTextStyle).toBe(true);
  });
});
