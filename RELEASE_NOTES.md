**Additions:**

- **Flatpak:** Added flatpak support for much easier download of the app (Gonna be uploaded to flathub later)
- **Interface scale control:** New setting to control the interface scale (by [@gmcky](https://github.com/gmcky), Thanks a lot!)
- **Window zoom:** Scale main window content via a zoom controls / Ctrl+Plus, Ctrl+Minus / Ctrl+0 to reset (by [@gmcky](https://github.com/gmcky), Thanks a lot!)
- **Configurable global shortcut:** User-configurable global shortcut to open the main window, persisted, with an in-app recorder in Settings to rebind it (by [@gmcky](https://github.com/gmcky), Thanks a lot!)
- **Configurable popup trigger:** The popup translate trigger is now configurable and persisted, with its own recorder. It was previously hardcoded to a double Ctrl+C. An empty value disables the popup, and the default is platform-aware (Cmd+C on macOS, Ctrl+C elsewhere). The rdev double-press mechanism and clipboard coupling are unchanged (by [@gmcky](https://github.com/gmcky), Thanks a lot!)
- **Instant typing:** Opening the window (hotkey, tray, or the Open menu item) focuses the text input so typing can start right away. It is tied to the open action rather than window focus, so returning to the window by other means does not steal focus or clear a selection (by [@gmcky](https://github.com/gmcky), Thanks a lot!)
