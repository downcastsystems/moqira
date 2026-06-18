import type { CanvasNode } from "../types";

export type LayerAction = "front" | "back" | "forward" | "backward";

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type IdFactory = (prefix: string) => string;

export function pointHitsNode(x: number, y: number, node: CanvasNode) {
  return x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height;
}

export function rectFromPoints(startX: number, startY: number, currentX: number, currentY: number): CanvasRect {
  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  return {
    x,
    y,
    width: Math.abs(currentX - startX),
    height: Math.abs(currentY - startY),
  };
}

export function rectIntersectsNode(rect: CanvasRect, node: CanvasNode) {
  return rect.x <= node.x + node.width && rect.x + rect.width >= node.x && rect.y <= node.y + node.height && rect.y + rect.height >= node.y;
}

export function moveNodeLayer(nodes: CanvasNode[], ids: string[], action: LayerAction) {
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

export function patchNode(nodes: CanvasNode[], id: string, patch: Partial<CanvasNode>) {
  return nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
}

export function patchNodes(nodes: CanvasNode[], patches: Record<string, Partial<CanvasNode>>) {
  return nodes.map((node) => (patches[node.id] ? { ...node, ...patches[node.id] } : node));
}

export function selectedNodesInStack(nodes: CanvasNode[], ids: string[]) {
  const selected = new Set(ids);
  return nodes.filter((node) => selected.has(node.id));
}

export function duplicateNodesInStack(nodes: CanvasNode[], ids: string[], createId: IdFactory) {
  const duplicatesById = new Map(
    selectedNodesInStack(nodes, ids).map((node) => [
      node.id,
      { ...node, id: createId("node"), x: node.x + 24, y: node.y + 24 },
    ]),
  );
  return {
    nodes: nodes.flatMap((node) => {
      const duplicate = duplicatesById.get(node.id);
      return duplicate ? [node, duplicate] : [node];
    }),
    duplicates: Array.from(duplicatesById.values()),
  };
}

export function cloneNodesForPaste(
  clipboard: CanvasNode[],
  createId: IdFactory,
  point?: { x: number; y: number },
) {
  const minX = Math.min(...clipboard.map((node) => node.x));
  const minY = Math.min(...clipboard.map((node) => node.y));
  const offsetX = point ? Math.round(point.x - minX) : 24;
  const offsetY = point ? Math.round(point.y - minY) : 24;
  return clipboard.map((item) => ({
    ...item,
    id: createId("node"),
    x: Math.round(item.x + offsetX),
    y: Math.round(item.y + offsetY),
    name: item.name,
  }));
}
