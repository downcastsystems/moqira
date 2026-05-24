import { invoke } from "@tauri-apps/api/core";
import type { MockupProject } from "../types";

const demoProjectKey = "mockups-demo-project";

export function isTauri() {
  return "__TAURI_INTERNALS__" in window;
}

export async function openProjectFile(path: string): Promise<MockupProject> {
  if (isTauri()) return invoke<MockupProject>("open_project_file", { path });
  const raw = localStorage.getItem(demoProjectKey);
  if (!raw) throw new Error("No browser demo project has been saved yet.");
  return JSON.parse(raw) as MockupProject;
}

export async function saveProjectFile(path: string, project: MockupProject): Promise<void> {
  if (isTauri()) {
    await invoke("save_project_file", { payload: { path, project } });
    return;
  }
  localStorage.setItem(demoProjectKey, JSON.stringify(project, null, 2));
}

export async function revealProject(path: string) {
  if (!isTauri()) return;
  await invoke("reveal_project", { path });
}
