use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn get_settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .map(|p| p.join("settings.json"))
            .ok_or("Failed to resolve executable directory")?)
    }

    #[cfg(not(target_os = "windows"))]
    {
        app.path()
            .app_config_dir()
            .map(|dir| dir.join("settings.json"))
            .map_err(|e| format!("Failed to resolve config directory: {e}"))
    }
}

#[tauri::command]
pub fn save_settings(app: AppHandle, payload: String) -> Result<(), String> {
    let path = get_settings_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(path, payload).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<String, String> {
    let path = get_settings_path(&app)?;
    fs::read_to_string(path).map_err(|_e| "".to_string())
}
