use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::menu::{AboutMetadataBuilder, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WindowEvent};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProjectPayload {
    path: String,
    project: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    last_project_path: Option<String>,
    #[serde(default)]
    recent_projects: Vec<RecentProject>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RecentProject {
    path: String,
    name: String,
    opened_at: u64,
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Could not find app config directory: {error}"))?;
    fs::create_dir_all(&dir).map_err(|error| format!("Could not create app config directory: {error}"))?;
    Ok(dir.join("settings.json"))
}

fn read_settings(app: &tauri::AppHandle) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(path).map_err(|error| format!("Could not read app settings: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("App settings are not valid JSON: {error}"))
}

fn write_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let content = serde_json::to_string_pretty(settings).map_err(|error| format!("Could not encode app settings: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Could not write app settings: {error}"))
}

fn build_app_menu(handle: &tauri::AppHandle, recent_projects: &[RecentProject]) -> tauri::Result<Menu<tauri::Wry>> {
    let about = PredefinedMenuItem::about(
        handle,
        None,
        Some(AboutMetadataBuilder::new().name(Some("Moqira".to_string())).version(Some("0.1.0".to_string())).build()),
    )?;
    let settings = MenuItem::with_id(handle, "menu_settings", "Settings...", true, Some("Cmd+,"))?;
    let quit = MenuItem::with_id(handle, "menu_quit", "Quit Moqira", true, Some("Cmd+Q"))?;
    let app_menu = Submenu::with_items(
        handle,
        "Moqira",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(handle)?,
            &settings,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, None)?,
            &PredefinedMenuItem::hide_others(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &quit,
        ],
    )?;

    let recent_menu = Submenu::new(handle, "Recently Opened", true)?;
    if recent_projects.is_empty() {
        let empty = MenuItem::with_id(handle, "menu_recent_empty", "No Recent Projects", false, None::<&str>)?;
        recent_menu.append(&empty)?;
    } else {
        for (index, project) in recent_projects.iter().take(8).enumerate() {
            let item = MenuItem::with_id(
                handle,
                format!("menu_open_recent_{index}"),
                &project.name,
                true,
                None::<&str>,
            )?;
            recent_menu.append(&item)?;
        }
    }

    let file_menu = Submenu::with_items(
        handle,
        "File",
        true,
        &[
            &MenuItem::with_id(handle, "menu_new_project", "New Project", true, Some("Cmd+N"))?,
            &MenuItem::with_id(handle, "menu_open_project", "Open...", true, Some("Cmd+O"))?,
            &recent_menu,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "menu_save_project", "Save", true, Some("Cmd+S"))?,
            &MenuItem::with_id(handle, "menu_save_project_as", "Save As...", true, Some("Shift+Cmd+S"))?,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "menu_file_settings", "Settings...", true, None::<&str>)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(handle, None)?,
            &PredefinedMenuItem::redo(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, None)?,
            &PredefinedMenuItem::copy(handle, None)?,
            &PredefinedMenuItem::paste(handle, None)?,
            &PredefinedMenuItem::select_all(handle, None)?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, None)?,
            &PredefinedMenuItem::maximize(handle, None)?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::close_window(handle, None)?,
        ],
    )?;

    Menu::with_items(handle, &[&app_menu, &file_menu, &edit_menu, &window_menu])
}

fn rebuild_app_menu(app: &tauri::AppHandle) -> Result<(), String> {
    let settings = read_settings(app).unwrap_or_default();
    let menu = build_app_menu(app, &settings.recent_projects).map_err(|error| error.to_string())?;
    app.set_menu(menu).map(|_| ()).map_err(|error| error.to_string())
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

#[tauri::command]
fn read_last_project_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    Ok(read_settings(&app)?.last_project_path)
}

#[tauri::command]
fn write_last_project_path(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let mut settings = read_settings(&app).unwrap_or_default();
    settings.last_project_path = path;
    write_settings(&app, &settings)?;
    rebuild_app_menu(&app)
}

#[tauri::command]
fn sync_recent_projects(app: tauri::AppHandle, recent_projects: Vec<RecentProject>) -> Result<(), String> {
    let mut settings = read_settings(&app).unwrap_or_default();
    settings.recent_projects = recent_projects.into_iter().take(8).collect();
    write_settings(&app, &settings)?;
    rebuild_app_menu(&app)
}

fn main() {
    tauri::Builder::default()
        .menu(|handle| build_app_menu(handle, &[]))
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "menu_new_project" => {
                    let _ = app.emit("menu-new-project", ());
                }
                "menu_open_project" => {
                    let _ = app.emit("menu-open-project", ());
                }
                "menu_save_project" => {
                    let _ = app.emit("menu-save-project", ());
                }
                "menu_save_project_as" => {
                    let _ = app.emit("menu-save-project-as", ());
                }
                "menu_settings" | "menu_file_settings" => {
                    let _ = app.emit("menu-open-settings", ());
                }
                "menu_quit" => {
                    let _ = app.emit("mockups-window-close-requested", ());
                }
                _ if id.starts_with("menu_open_recent_") => {
                    if let Ok(index) = id.trim_start_matches("menu_open_recent_").parse::<usize>() {
                        if let Ok(settings) = read_settings(app) {
                            if let Some(project) = settings.recent_projects.get(index) {
                                let _ = app.emit("menu-open-recent-project", project.path.clone());
                            }
                        }
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            open_project_file,
            save_project_file,
            reveal_project,
            read_last_project_path,
            write_last_project_path,
            sync_recent_projects
        ])
        .setup(|app| {
            rebuild_app_menu(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                let window_for_event = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_for_event.emit("mockups-window-closing", ());
                        let _ = window_for_event.emit("mockups-window-close-requested", ());
                    }
                });
                window.show().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Moqira");
}
