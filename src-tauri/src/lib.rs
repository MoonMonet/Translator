use std::sync::Mutex;
use std::time::Instant;
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod commands;

struct CtrlCState {
    last_press: Option<Instant>,
}

struct OpenHotkey(Mutex<Option<String>>);

struct PopupCombo {
    ctrl: bool,
    shift: bool,
    alt: bool,
    meta: bool,
    key: rdev::Key,
}

struct PopupHotkey(Mutex<Option<PopupCombo>>);

fn default_popup_combo() -> PopupCombo {
    parse_popup_combo(DEFAULT_POPUP_HOTKEY).expect("valid default popup hotkey")
}

fn key_from_str(s: &str) -> Option<rdev::Key> {
    use rdev::Key;
    match s.to_uppercase().as_str() {
        "A" => Some(Key::KeyA),
        "B" => Some(Key::KeyB),
        "C" => Some(Key::KeyC),
        "D" => Some(Key::KeyD),
        "E" => Some(Key::KeyE),
        "F" => Some(Key::KeyF),
        "G" => Some(Key::KeyG),
        "H" => Some(Key::KeyH),
        "I" => Some(Key::KeyI),
        "J" => Some(Key::KeyJ),
        "K" => Some(Key::KeyK),
        "L" => Some(Key::KeyL),
        "M" => Some(Key::KeyM),
        "N" => Some(Key::KeyN),
        "O" => Some(Key::KeyO),
        "P" => Some(Key::KeyP),
        "Q" => Some(Key::KeyQ),
        "R" => Some(Key::KeyR),
        "S" => Some(Key::KeyS),
        "T" => Some(Key::KeyT),
        "U" => Some(Key::KeyU),
        "V" => Some(Key::KeyV),
        "W" => Some(Key::KeyW),
        "X" => Some(Key::KeyX),
        "Y" => Some(Key::KeyY),
        "Z" => Some(Key::KeyZ),
        "0" => Some(Key::Num0),
        "1" => Some(Key::Num1),
        "2" => Some(Key::Num2),
        "3" => Some(Key::Num3),
        "4" => Some(Key::Num4),
        "5" => Some(Key::Num5),
        "6" => Some(Key::Num6),
        "7" => Some(Key::Num7),
        "8" => Some(Key::Num8),
        "9" => Some(Key::Num9),
        "F1" => Some(Key::F1),
        "F2" => Some(Key::F2),
        "F3" => Some(Key::F3),
        "F4" => Some(Key::F4),
        "F5" => Some(Key::F5),
        "F6" => Some(Key::F6),
        "F7" => Some(Key::F7),
        "F8" => Some(Key::F8),
        "F9" => Some(Key::F9),
        "F10" => Some(Key::F10),
        "F11" => Some(Key::F11),
        "F12" => Some(Key::F12),
        _ => None,
    }
}

fn parse_popup_combo(accel: &str) -> Option<PopupCombo> {
    let mut combo = PopupCombo {
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        key: rdev::Key::KeyC,
    };
    let mut has_key = false;

    for part in accel.split('+') {
        match part.trim() {
            "Ctrl" | "Control" => combo.ctrl = true,
            "Shift" => combo.shift = true,
            "Alt" => combo.alt = true,
            "Super" | "Meta" | "Cmd" | "Command" => combo.meta = true,
            "" => {}
            other => {
                combo.key = key_from_str(other)?;
                has_key = true;
            }
        }
    }

    let has_modifier = combo.ctrl || combo.shift || combo.alt || combo.meta;
    if has_key && has_modifier {
        Some(combo)
    } else {
        None
    }
}

const DEFAULT_OPEN_HOTKEY: &str = "Ctrl+Shift+T";
#[cfg(target_os = "macos")]
const DEFAULT_POPUP_HOTKEY: &str = "Super+C";
#[cfg(not(target_os = "macos"))]
const DEFAULT_POPUP_HOTKEY: &str = "Ctrl+C";
const AUTOSTART_ARG: &str = "--autostart";
const DOUBLE_PRESS_TIMEOUT_MS: u128 = 500;
const POPUP_WIDTH: f64 = 380.0;
const POPUP_HEIGHT: f64 = 280.0;
const CARET_GAP: i32 = 8;
const CARET_LINE_HEIGHT_ESTIMATE: i32 = 20;

fn show_and_focus_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        // fix app close??
        #[cfg(target_os = "windows")]
        let _ = window.set_skip_taskbar(false);

        let _ = window.unminimize();
        let _ = window
            .show()
            .inspect_err(|e| log::warn!("Failed to show window {label}: {e}"));
        let _ = window
            .set_focus()
            .inspect_err(|e| log::warn!("Failed to focus window {label}: {e}"));
    }
}

fn focus_main_input(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window
            .emit("focus-input", ())
            .inspect_err(|e| log::warn!("Failed to emit focus-input: {e}"));
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);

        if visible && focused {
            let _ = window
                .hide()
                .inspect_err(|e| log::warn!("Failed to hide main window: {e}"));

            #[cfg(target_os = "windows")]
            let _ = window.set_skip_taskbar(true);
        } else {
            show_and_focus_window(app, "main");
            focus_main_input(app);
        }
    }
}

fn read_open_hotkey(app: &AppHandle) -> String {
    let path = match app.path().app_config_dir() {
        Ok(dir) => dir.join("settings.json"),
        Err(_) => return DEFAULT_OPEN_HOTKEY.to_string(),
    };

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return DEFAULT_OPEN_HOTKEY.to_string(),
    };

    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|json| json.get("openHotkey").and_then(|v| v.as_str()).map(str::to_string))
        .unwrap_or_else(|| DEFAULT_OPEN_HOTKEY.to_string())
}

fn read_start_minimized(app: &AppHandle) -> bool {
    let path = match app.path().app_config_dir() {
        Ok(dir) => dir.join("settings.json"),
        Err(_) => return false,
    };

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|json| json.get("startMinimized").and_then(|v| v.as_bool()))
        .unwrap_or(false)
}

fn apply_open_hotkey(app: &AppHandle, accel: &str) -> Result<(), String> {
    let gs = app.global_shortcut();

    if let Some(state) = app.try_state::<OpenHotkey>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(prev) = guard.take() {
                let _ = gs.unregister(prev.as_str());
            }
        }
    }

    let accel = accel.trim();
    if accel.is_empty() {
        return Ok(());
    }

    gs.on_shortcut(accel, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_main_window(app);
        }
    })
    .map_err(|e| format!("Failed to register shortcut '{accel}': {e}"))?;

    if let Some(state) = app.try_state::<OpenHotkey>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = Some(accel.to_string());
        }
    }

    Ok(())
}

#[tauri::command]
fn set_open_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    apply_open_hotkey(&app, &accelerator)
}

fn read_popup_hotkey(app: &AppHandle) -> String {
    let path = match app.path().app_config_dir() {
        Ok(dir) => dir.join("settings.json"),
        Err(_) => return DEFAULT_POPUP_HOTKEY.to_string(),
    };

    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return DEFAULT_POPUP_HOTKEY.to_string(),
    };

    serde_json::from_str::<serde_json::Value>(&content)
        .ok()
        .and_then(|json| json.get("popupHotkey").and_then(|v| v.as_str()).map(str::to_string))
        .unwrap_or_else(|| DEFAULT_POPUP_HOTKEY.to_string())
}

fn apply_popup_hotkey(app: &AppHandle, accel: &str) -> Result<(), String> {
    let combo = if accel.trim().is_empty() {
        None
    } else {
        Some(parse_popup_combo(accel).ok_or_else(|| format!("Invalid popup hotkey: '{accel}'"))?)
    };

    if let Some(state) = app.try_state::<PopupHotkey>() {
        if let Ok(mut guard) = state.0.lock() {
            *guard = combo;
        }
    }

    Ok(())
}

#[tauri::command]
fn set_popup_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    apply_popup_hotkey(&app, &accelerator)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(CtrlCState { last_press: None }))
        .manage(OpenHotkey(Mutex::new(None)))
        .manage(PopupHotkey(Mutex::new(Some(default_popup_combo()))))
        .invoke_handler(tauri::generate_handler![
            commands::translate::translate_text,
            commands::translate::validate_api_key,
            commands::cursor::get_cursor_position,
            commands::window::open_popup_window,
            commands::window::close_popup_window,
            commands::window::hide_main_window,
            commands::window::open_main_window,
            commands::window::set_main_zoom,
            commands::window::set_popup_pinned,
            commands::window::simulate_paste,
            commands::store::save_settings,
            commands::store::load_settings,
            commands::updater::download_and_install_update,
            set_open_hotkey,
            set_popup_hotkey,
        ])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if let Ok(display_backend) = std::env::var("XDG_SESSION_TYPE") {
                if display_backend == "wayland" {
                    log::info!("Running on a Wayland session: some features (global shortcut, caret positioning) are limited. The 'wtype' or 'ydotool' tool is needed for the Replace feature.");
                }
            }

            // Entries registered before AUTOSTART_ARG existed carry no arguments,
            // so rewrite them once the app knows autostart is on.
            let autolaunch = app.autolaunch();
            if autolaunch.is_enabled().unwrap_or(false) {
                let _ = autolaunch
                    .enable()
                    .inspect_err(|e| log::warn!("Failed to refresh autostart entry: {e}"));
            }

            let launched_by_autostart = std::env::args().any(|arg| arg == AUTOSTART_ARG);

            if launched_by_autostart && read_start_minimized(app.handle()) {
                #[cfg(target_os = "windows")]
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_skip_taskbar(true);
                }
            } else {
                show_and_focus_window(app.handle(), "main");
            }

            let open_item = MenuItemBuilder::with_id("open", "Open MoonTranslator").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let update_item =
                MenuItemBuilder::with_id("check_update", "Check for Updates").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&open_item)
                .item(&settings_item)
                .separator()
                .item(&update_item)
                .separator()
                .item(&quit_item)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("MoonTranslator")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        show_and_focus_window(app, "main");
                        focus_main_input(app);
                    }
                    "settings" => {
                        show_and_focus_window(app, "main");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window
                                .eval("window.location.hash = '#settings'")
                                .inspect_err(|e| log::warn!("Failed to eval: {e}"));
                        }
                    }
                    "check_update" => {
                        show_and_focus_window(app, "main");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window
                                .emit("check-update", ())
                                .inspect_err(|e| log::warn!("Failed to emit event: {e}"));
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_and_focus_window(tray.app_handle(), "main");
                        focus_main_input(tray.app_handle());
                    }
                })
                .build(app)?;

            setup_global_shortcut(app.handle())?;

            let open_hotkey = read_open_hotkey(app.handle());
            if let Err(e) = apply_open_hotkey(app.handle(), &open_hotkey) {
                log::warn!("Failed to register open hotkey: {e}");
            }

            let popup_hotkey = read_popup_hotkey(app.handle());
            if let Err(e) = apply_popup_hotkey(app.handle(), &popup_hotkey) {
                log::warn!("Failed to register popup hotkey: {e}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();

                    let win = window.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = win
                            .hide()
                            .inspect_err(|e| log::warn!("Failed to hide main window: {e}"));

                        #[cfg(target_os = "windows")]
                        let _ = win.set_skip_taskbar(true);
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.clone();

    std::thread::spawn(move || {
        use rdev::{listen, EventType, Key};
        let mut ctrl = false;
        let mut shift = false;
        let mut alt = false;
        let mut meta = false;
        let mut trigger_held = false;

        if let Err(e) = listen(move |event| match event.event_type {
            EventType::KeyPress(Key::ControlLeft) | EventType::KeyPress(Key::ControlRight) => {
                ctrl = true;
            }
            EventType::KeyRelease(Key::ControlLeft) | EventType::KeyRelease(Key::ControlRight) => {
                ctrl = false;
            }
            EventType::KeyPress(Key::ShiftLeft) | EventType::KeyPress(Key::ShiftRight) => {
                shift = true;
            }
            EventType::KeyRelease(Key::ShiftLeft) | EventType::KeyRelease(Key::ShiftRight) => {
                shift = false;
            }
            EventType::KeyPress(Key::Alt) | EventType::KeyPress(Key::AltGr) => {
                alt = true;
            }
            EventType::KeyRelease(Key::Alt) | EventType::KeyRelease(Key::AltGr) => {
                alt = false;
            }
            EventType::KeyPress(Key::MetaLeft) | EventType::KeyPress(Key::MetaRight) => {
                meta = true;
            }
            EventType::KeyRelease(Key::MetaLeft) | EventType::KeyRelease(Key::MetaRight) => {
                meta = false;
            }
            EventType::KeyPress(key) => {
                if trigger_held {
                    return;
                }
                let matches = app_handle
                    .try_state::<PopupHotkey>()
                    .and_then(|state| {
                        state.0.lock().ok().and_then(|guard| {
                            guard.as_ref().map(|combo| {
                                key == combo.key
                                    && (ctrl || !combo.ctrl)
                                    && (shift || !combo.shift)
                                    && (alt || !combo.alt)
                                    && (meta || !combo.meta)
                            })
                        })
                    })
                    .unwrap_or(false);

                if matches {
                    trigger_held = true;
                    let now = std::time::Instant::now();
                    let mut trigger = false;

                    if let Some(state_mutex) = app_handle.try_state::<Mutex<CtrlCState>>() {
                        if let Ok(mut state) = state_mutex.lock() {
                            if let Some(last) = state.last_press {
                                if now.duration_since(last).as_millis() < DOUBLE_PRESS_TIMEOUT_MS {
                                    trigger = true;
                                    state.last_press = None;
                                } else {
                                    state.last_press = Some(now);
                                }
                            } else {
                                state.last_press = Some(now);
                            }
                        }
                    }

                    if trigger {
                        trigger_held = false;
                        let ah = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = open_popup(&ah).await {
                                log::error!("Failed to open popup: {e}");
                            }
                        });
                    }
                } else {
                    if let Some(state_mutex) = app_handle.try_state::<Mutex<CtrlCState>>() {
                        if let Ok(mut state) = state_mutex.lock() {
                            state.last_press = None;
                        }
                    }
                }
            }
            EventType::KeyRelease(_) => {
                trigger_held = false;
            }
            _ => {}
        }) {
            log::error!("Global shortcut listener crashed: {:?}", e);
        }
    });

    Ok(())
}

async fn open_popup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let (target_x, target_y) = if let Some((caret_x, caret_y)) = commands::cursor::get_caret_pos()
    {
        let bounds = commands::cursor::get_screen_bounds(app, caret_x, caret_y);
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

        (x, y)
    } else {
        let (mouse_x, mouse_y) = commands::cursor::get_cursor_pos(app);
        let bounds = commands::cursor::get_screen_bounds(app, mouse_x, mouse_y);
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
    };

    if let Some(popup) = app.get_webview_window("popup") {
        #[cfg(target_os = "windows")]
        let _ = popup.set_skip_taskbar(true);
        let _ = popup.set_always_on_top(true);

        let _ = popup
            .set_position(tauri::PhysicalPosition::new(target_x, target_y))
            .inspect_err(|e| log::warn!("Failed to position popup: {e}"));
        let _ = popup
            .show()
            .inspect_err(|e| log::warn!("Failed to show popup: {e}"));
        let _ = popup
            .set_focus()
            .inspect_err(|e| log::warn!("Failed to focus popup: {e}"));
        let _ = popup
            .emit("popup-refresh", ())
            .inspect_err(|e| log::warn!("Failed to emit refresh: {e}"));
        return Ok(());
    }

    let popup = WebviewWindowBuilder::new(app, "popup", WebviewUrl::App("popup".into()))
        .title("")
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
        .min_inner_size(320.0, 180.0)
        .position(target_x as f64, target_y as f64)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .transparent(true)
        .shadow(false)
        .build()?;

    let _ = popup
        .set_focus()
        .inspect_err(|e| log::warn!("Failed to focus new popup: {e}"));

    Ok(())
}
