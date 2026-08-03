use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use super::cursor::{get_caret_pos, get_cursor_pos, get_screen_bounds};

const POPUP_WIDTH: f64 = 380.0;
const POPUP_HEIGHT: f64 = 280.0;

const CARET_GAP: i32 = 8;
const CARET_LINE_HEIGHT_ESTIMATE: i32 = 20;

const PASTE_INIT_DELAY_MS: u64 = 300;
const PASTE_MODIFIER_DELAY_MS: u64 = 20;
const PASTE_KEY_HOLD_MS: u64 = 30;

fn calculate_popup_position(app: &AppHandle, has_text: bool) -> (i32, i32) {
    if has_text {
        if let Some((caret_x, caret_y)) = get_caret_pos() {
            let bounds = get_screen_bounds(app, caret_x, caret_y);
            let popup_w = (POPUP_WIDTH * bounds.scale_factor) as i32;
            let popup_h = (POPUP_HEIGHT * bounds.scale_factor) as i32;

            let mut x = caret_x - popup_w / 2;
            x = x.max(bounds.left).min(bounds.right - popup_w);

            let y_below = caret_y + CARET_GAP;
            let y_above = caret_y - CARET_LINE_HEIGHT_ESTIMATE - CARET_GAP - popup_h;

            let y = if y_below + popup_h <= bounds.bottom {
                y_below
            } else if y_above >= bounds.top {
                y_above
            } else {
                bounds.bottom - popup_h
            };

            return (x, y);
        }
    }

    let (mouse_x, mouse_y) = get_cursor_pos(app);
    let bounds = get_screen_bounds(app, mouse_x, mouse_y);
    let popup_w = (POPUP_WIDTH * bounds.scale_factor) as i32;
    let popup_h = (POPUP_HEIGHT * bounds.scale_factor) as i32;

    let mut x = mouse_x - popup_w / 2;
    let mut y = mouse_y - popup_h - 10;

    if y < bounds.top {
        y = mouse_y + 20;
    }

    x = x.max(bounds.left).min(bounds.right - popup_w);
    y = y.max(bounds.top).min(bounds.bottom - popup_h);

    (x, y)
}

#[tauri::command]
pub async fn open_popup_window(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let has_text = app
        .clipboard()
        .read_text()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);

    let (target_x, target_y) = calculate_popup_position(&app, has_text);

    if let Some(popup) = app.get_webview_window("popup") {
        #[cfg(target_os = "windows")]
        let _ = popup.set_skip_taskbar(true);
        let _ = popup.set_always_on_top(true);
        
        let _ = popup
            .set_position(tauri::PhysicalPosition::new(target_x, target_y))
            .inspect_err(|e| log::warn!("Failed to set popup position: {}", e));
        let _ = popup
            .show()
            .inspect_err(|e| log::warn!("Failed to show popup: {}", e));
        let _ = popup
            .set_focus()
            .inspect_err(|e| log::warn!("Failed to set popup focus: {}", e));
        let _ = popup
            .emit("popup-refresh", ())
            .inspect_err(|e| log::warn!("Failed to emit popup-refresh: {}", e));
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, "popup", WebviewUrl::App("popup".into()))
        .title("")
        .inner_size(380.0, 280.0)
        .min_inner_size(320.0, 180.0)
        .position(target_x as f64, target_y as f64)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .transparent(true)
        .shadow(false)
        .build()
        .map_err(|e| format!("Failed to create popup window: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn close_popup_window(app: AppHandle) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") {
        #[cfg(target_os = "windows")]
        let _ = popup.set_skip_taskbar(true);

        let _ = popup
            .hide()
            .inspect_err(|e| log::warn!("Failed to hide popup: {}", e));
    }
    Ok(())
}

#[tauri::command]
pub async fn hide_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window
            .hide()
            .inspect_err(|e| log::warn!("Failed to hide main window: {}", e));

        #[cfg(target_os = "windows")]
        let _ = window.set_skip_taskbar(true);
    }
    Ok(())
}

#[tauri::command]
pub async fn open_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        
        #[cfg(target_os = "windows")]
        let _ = window.set_skip_taskbar(false);
        
        let _ = window.set_focus();
    }
    Ok(())
}

#[tauri::command]
pub async fn set_popup_pinned(app: AppHandle, pinned: bool) -> Result<(), String> {
    if let Some(popup) = app.get_webview_window("popup") {
        let _ = popup.set_always_on_top(pinned).inspect_err(|e| log::warn!("Failed to set always on top: {}", e));
        
        #[cfg(target_os = "windows")]
        let _ = popup.set_skip_taskbar(pinned);
    }
    Ok(())
}

#[tauri::command]
pub async fn simulate_paste() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WAYLAND_DISPLAY").is_ok() {
            return simulate_paste_wayland();
        }
    }

    use rdev::{simulate, EventType, Key};
    use std::thread;
    use std::time::Duration;

    thread::sleep(Duration::from_millis(PASTE_INIT_DELAY_MS));

    #[cfg(target_os = "macos")]
    let modifier = Key::MetaLeft;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::ControlLeft;

    simulate(&EventType::KeyPress(modifier))
        .map_err(|e| format!("Failed to press modifier: {:?}", e))?;

    thread::sleep(Duration::from_millis(PASTE_MODIFIER_DELAY_MS));
    simulate(&EventType::KeyPress(Key::KeyV)).map_err(|e| format!("Failed to press V: {:?}", e))?;
    thread::sleep(Duration::from_millis(PASTE_KEY_HOLD_MS));
    simulate(&EventType::KeyRelease(Key::KeyV))
        .map_err(|e| format!("Failed to release V: {:?}", e))?;
    simulate(&EventType::KeyRelease(modifier))
        .map_err(|e| format!("Failed to release modifier: {:?}", e))?;

    Ok(())
}

#[cfg(target_os = "linux")]
fn simulate_paste_wayland() -> Result<(), String> {
    use std::process::Command;

    std::thread::sleep(std::time::Duration::from_millis(PASTE_INIT_DELAY_MS));

    if let Ok(status) = Command::new("wtype").args(["-M", "ctrl", "-k", "v", "-m", "ctrl"]).status() {
        if status.success() {
            return Ok(());
        }
    }

    if let Ok(status) = Command::new("ydotool").args(["key", "29:1", "47:1", "47:0", "29:0"]).status() {
        if status.success() {
            return Ok(());
        }
    }

    Err(
        "Paste requires an X11 session, or the 'wtype' or 'ydotool' tool installed \
         on Wayland. Install one with: sudo apt install wtype".into(),
    )
}
