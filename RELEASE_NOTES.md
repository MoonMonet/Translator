**Additions:**

- **Linux Support:** Added Linux support to the app
- **Content‑Security‑Policy:** Added proper CSP links
- **Interface scale control:** New setting to control the interface scale
- **Persistent UI scale:** The chosen interface scale is now saved and restored across sessions
- **Window zoom:** Scale main window content via a zoom command

**Fixes:**

- **Security:** Trim unused webview capabilities (Thanks to [@Evgeshkaeqw](https://github.com/Evgeshkaeqw) for making a pull request for this)
- **Security #2:** Secure keys by putting them into other place
- **Security #3:** Replace open proxy command with scoped http plugin
- **Security #4:** Harden update integrity checks
- **Emoji in Changelog window:** Now emoji from changelog window doesn't use external source
- **UI scale drift:** Round uiScale to avoid float drift
