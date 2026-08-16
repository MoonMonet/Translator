**Fixes:**

- **Fixed updater path handling for non-ASCII Windows usernames:** Paths with non-ASCII characters weren't sent correctly to the update script.
- **Hide Ctrl+Enter hint:** Ctrl+Enter only triggers a manual translation, so the hint is hidden while auto-translate is on. (by [@gmcky](https://github.com/gmcky))
- **Holding of popup hotkey:** Holding the popup hotkey (e.g. Ctrl+C) let OS key auto-repeat count as repeated presses, so a held combo opened the popup on its own. Track the trigger key as held and ignore repeats until it is released, so only real double-taps open the popup. (by [@gmcky](https://github.com/gmcky))
- **All sizes of the app behave properly:** At high webview zoom / narrow window widths the main layout broke: the header title and controls overflowed, the language dropdown clipped at the viewport edge, and long output tokens pushed past the pane, so that was fixed. (by [@gmcky](https://github.com/gmcky)) (also tested on tiling windows managers on linux)

Big Thanks to [@gmcky](https://github.com/gmcky) that he helps this translator app with his own fixes! :)

**Future plans:**

- Add AI API keys that also could be used instead of translators API keys.