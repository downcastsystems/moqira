use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{Emitter, Manager, WindowEvent};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProjectPayload {
    path: String,
    project: serde_json::Value,
}

#[tauri::command]
fn open_project_file(path: String) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(&path).map_err(|error| format!("Could not read project file: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("Project file is not valid JSON: {error}"))
}

#[tauri::command]
fn save_project_file(payload: SaveProjectPayload) -> Result<(), String> {
    if let Some(parent) = Path::new(&payload.path).parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create project folder: {error}"))?;
    }
    let content = serde_json::to_string_pretty(&payload.project).map_err(|error| format!("Could not encode project: {error}"))?;
    fs::write(&payload.path, content).map_err(|error| format!("Could not save project file: {error}"))
}

#[tauri::command]
fn reveal_project(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|error| format!("Could not reveal project: {error}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|error| format!("Could not reveal project: {error}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        let folder = Path::new(&path).parent().unwrap_or_else(|| Path::new("."));
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|error| format!("Could not reveal project: {error}"))?;
    }

    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_project_file, save_project_file, reveal_project])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let window_for_event = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, WindowEvent::CloseRequested { .. }) {
                        let _ = window_for_event.emit("mockups-window-closing", ());
                    }
                });
                window.show().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mockups");
}
