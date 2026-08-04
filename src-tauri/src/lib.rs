use std::sync::Mutex;
use std::time::Instant;
use tauri::Emitter;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod commands;

struct CtrlCState {
    last_press: Option<Instant>,
}

struct OpenHotkey(Mutex<Option<String>>);

const DEFAULT_OPEN_HOTKEY: &str = "Ctrl+Shift+T";
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
            Some(vec![]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(CtrlCState { last_press: None }))
        .manage(OpenHotkey(Mutex::new(None)))
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
        ])
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if let Ok(display_backend) = std::env::var("XDG_SESSION_TYPE") {
                if display_backend == "wayland" {
                    log::info!("Running on a Wayland session: some features (global shortcut, caret positioning) are limited. The 'wtype' or 'ydotool' tool is needed for the Replace feature.");
                }
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
                    }
                })
                .build(app)?;

            setup_global_shortcut(app.handle())?;

            let open_hotkey = read_open_hotkey(app.handle());
            if let Err(e) = apply_open_hotkey(app.handle(), &open_hotkey) {
                log::warn!("Failed to register open hotkey: {e}");
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
        let mut ctrl_down = false;

        if let Err(e) = listen(move |event| match event.event_type {
            EventType::KeyPress(Key::ControlLeft)
            | EventType::KeyPress(Key::ControlRight)
            | EventType::KeyPress(Key::MetaLeft)
            | EventType::KeyPress(Key::MetaRight) => {
                ctrl_down = true;
            }
            EventType::KeyRelease(Key::ControlLeft)
            | EventType::KeyRelease(Key::ControlRight)
            | EventType::KeyRelease(Key::MetaLeft)
            | EventType::KeyRelease(Key::MetaRight) => {
                ctrl_down = false;
            }
            EventType::KeyPress(Key::KeyC) => {
                if ctrl_down {
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
