use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Serialize)]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy)]
pub struct ScreenBounds {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub scale_factor: f64,
}

#[tauri::command]
pub fn get_cursor_position(app: AppHandle) -> Result<CursorPosition, String> {
    let (x, y) = get_cursor_pos(&app);
    Ok(CursorPosition { x, y })
}

#[cfg(target_os = "windows")]
pub fn get_caret_pos() -> Option<(i32, i32)> {
    use std::mem::{size_of, zeroed};
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::ClientToScreen;
    use windows::Win32::UI::WindowsAndMessaging::{GetGUIThreadInfo, GUITHREADINFO};

    unsafe {
        let mut gti: GUITHREADINFO = zeroed();
        gti.cbSize = size_of::<GUITHREADINFO>() as u32;

        if GetGUIThreadInfo(0, &mut gti).is_ok() && !gti.hwndCaret.is_invalid() {
            let mut pt = POINT {
                x: gti.rcCaret.left,
                y: gti.rcCaret.bottom,
            };

            if ClientToScreen(gti.hwndCaret, &mut pt).as_bool() {
                if pt.x != 0 || pt.y != 0 {
                    return Some((pt.x, pt.y));
                }
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
pub fn get_caret_pos() -> Option<(i32, i32)> {
    None
}

#[cfg(target_os = "windows")]
pub fn get_cursor_pos(_app: &AppHandle) -> (i32, i32) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut point = POINT { x: 0, y: 0 };
    unsafe {
        let _ = GetCursorPos(&mut point);
    }
    (point.x, point.y)
}

#[cfg(target_os = "linux")]
pub fn get_cursor_pos(app: &AppHandle) -> (i32, i32) {
    if let Ok(display_backend) = std::env::var("XDG_SESSION_TYPE") {
        if display_backend == "wayland" {
            return get_cursor_pos_wayland(app);
        }
    }
    get_cursor_pos_x11()
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
pub fn get_cursor_pos(_app: &AppHandle) -> (i32, i32) {
    (500, 500)
}

#[cfg(target_os = "linux")]
fn get_cursor_pos_x11() -> (i32, i32) {
    use x11::xlib::*;
    use std::ptr;

    unsafe {
        let display = XOpenDisplay(ptr::null());
        if display.is_null() {
            return (500, 500);
        }

        let root = XDefaultRootWindow(display);
        let mut root_return = 0;
        let mut child_return = 0;
        let mut root_x = 0;
        let mut root_y = 0;
        let mut win_x = 0;
        let mut win_y = 0;
        let mut mask_return = 0;

        XQueryPointer(
            display,
            root,
            &mut root_return,
            &mut child_return,
            &mut root_x,
            &mut root_y,
            &mut win_x,
            &mut win_y,
            &mut mask_return,
        );

        XCloseDisplay(display);
        (root_x, root_y)
    }
}

#[cfg(target_os = "linux")]
fn get_cursor_pos_wayland(app: &AppHandle) -> (i32, i32) {
    // Wayland doesn't allow querying the global cursor position for security reasons.
    // Center on the primary monitor so the popup appears in a sensible spot.
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size();
        let position = monitor.position();
        return (
            position.x + size.width as i32 / 2,
            position.y + size.height as i32 / 2,
        );
    }
    (500, 500)
}

#[cfg(target_os = "windows")]
pub fn get_screen_bounds(_app: &AppHandle, x: i32, y: i32) -> ScreenBounds {
    use windows::Win32::Foundation::{POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};

    unsafe {
        let pt = POINT { x, y };
        let monitor = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;

        let mut dpi_x = 96;
        let mut dpi_y = 96;
        let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        let scale_factor = (dpi_x as f64 / 96.0).max(1.0);

        if GetMonitorInfoW(monitor, &mut mi).as_bool() {
            let rc: RECT = mi.rcWork;
            return ScreenBounds {
                left: rc.left,
                top: rc.top,
                right: rc.right,
                bottom: rc.bottom,
                scale_factor,
            };
        }
    }

    ScreenBounds {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        scale_factor: 1.0,
    }
}

#[cfg(target_os = "linux")]
pub fn get_screen_bounds(app: &AppHandle, x: i32, y: i32) -> ScreenBounds {
    if let Ok(display_backend) = std::env::var("XDG_SESSION_TYPE") {
        if display_backend == "wayland" {
            return get_screen_bounds_wayland(app);
        }
    }
    get_screen_bounds_x11(x, y)
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
pub fn get_screen_bounds(_app: &AppHandle, _x: i32, _y: i32) -> ScreenBounds {
    ScreenBounds {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        scale_factor: 1.0,
    }
}

#[cfg(target_os = "linux")]
fn get_screen_bounds_x11(x: i32, y: i32) -> ScreenBounds {
    use x11::xlib::*;
    use x11::xrandr::*;
    use std::ptr;

    unsafe {
        let display = XOpenDisplay(ptr::null());
        if display.is_null() {
            return ScreenBounds {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
                scale_factor: 1.0,
            };
        }

        let screen = XDefaultScreen(display);
        let root = XRootWindow(display, screen);

        let screen_resources = XRRGetScreenResources(display, root);
        if screen_resources.is_null() {
            XCloseDisplay(display);
            return ScreenBounds {
                left: 0,
                top: 0,
                right: XDisplayWidth(display, screen),
                bottom: XDisplayHeight(display, screen),
                scale_factor: 1.0,
            };
        }

        let num_outputs = (*screen_resources).noutput;
        let mut best_bounds = ScreenBounds {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
            scale_factor: 1.0,
        };

        for i in 0..num_outputs {
            let output = *(*screen_resources).outputs.offset(i as isize);
            let output_info = XRRGetOutputInfo(display, screen_resources, output);

            if output_info.is_null() || (*output_info).connection != 0 {
                if !output_info.is_null() {
                    XRRFreeOutputInfo(output_info);
                }
                continue;
            }

            let crtc_info = XRRGetCrtcInfo(display, screen_resources, (*output_info).crtc);
            if !crtc_info.is_null() {
                let crtc_x = (*crtc_info).x;
                let crtc_y = (*crtc_info).y;
                let crtc_width = (*crtc_info).width as i32;
                let crtc_height = (*crtc_info).height as i32;

                if x >= crtc_x && x < crtc_x + crtc_width && y >= crtc_y && y < crtc_y + crtc_height {
                    best_bounds = ScreenBounds {
                        left: crtc_x,
                        top: crtc_y,
                        right: crtc_x + crtc_width,
                        bottom: crtc_y + crtc_height,
                        scale_factor: 1.0,
                    };
                    XRRFreeCrtcInfo(crtc_info);
                    XRRFreeOutputInfo(output_info);
                    break;
                }
                XRRFreeCrtcInfo(crtc_info);
            }
            XRRFreeOutputInfo(output_info);
        }

        XRRFreeScreenResources(screen_resources);
        XCloseDisplay(display);
        best_bounds
    }
}

#[cfg(target_os = "linux")]
fn get_screen_bounds_wayland(app: &AppHandle) -> ScreenBounds {
    use tauri::Manager;

    if let Ok(Some(monitor)) = app.primary_monitor() {
        let size = monitor.size();
        let position = monitor.position();
        let scale_factor = monitor.scale_factor().max(1.0);
        return ScreenBounds {
            left: position.x,
            top: position.y,
            right: position.x + size.width as i32,
            bottom: position.y + size.height as i32,
            scale_factor,
        };
    }

    if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let position = monitor.position();
            let scale_factor = monitor.scale_factor().max(1.0);
            return ScreenBounds {
                left: position.x,
                top: position.y,
                right: position.x + size.width as i32,
                bottom: position.y + size.height as i32,
                scale_factor,
            };
        }
    }

    ScreenBounds {
        left: 0,
        top: 0,
        right: 1920,
        bottom: 1080,
        scale_factor: 1.0,
    }
}
