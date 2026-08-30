"use client";

import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/store/settingsStore";
import { useTranslatorStore, API_PROVIDERS } from "@/store/translatorStore";
import type { ApiProvider } from "@/store/translatorStore";
import { validateApiKey } from "@/lib/translate";
import { loadCache } from "@/lib/settingsCache";
import { APP_VERSION } from "@/lib/version";
import ChangelogModal from "@/components/ChangelogModal";
import {
  X,
  Moon,
  Sun,
  Key,
  Keyboard,
  Copy,
  Monitor,
  FileText,
  Trash2,
  Check,
  Loader2,
  Eye,
  EyeOff,
  ZoomIn,
  Minus,
  Plus,
  Minimize2,
} from "lucide-react";

export default function SettingsPanel() {
  const {
    settingsOpen,
    setSettingsOpen,
    darkMode,
    setDarkMode,
    autostart,
    setAutostart,
    startMinimized,
    setStartMinimized,
    apiKeys,
    setApiKey,
    activeApi,
    setActiveApi,
    providerModes,
    setProviderMode,
    openHotkey,
    setOpenHotkey,
    popupHotkey,
    setPopupHotkey,
    uiScale,
    setUiScale,
    saveToStore,
    clearStore,
  } = useSettingsStore();

  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [recordingPopupHotkey, setRecordingPopupHotkey] = useState(false);

  const { setActiveApi: setTranslatorApi } = useTranslatorStore();

  const [editingKeys, setEditingKeys] = useState<
    Record<ApiProvider, string>
  >({
    deepl: "",
    google: "",
    bing: "",
    lara: "",
    custom: "",
  });

  const [validating, setValidating] = useState<ApiProvider | null>(null);
  const [validationResult, setValidationResult] = useState<
    Record<string, boolean | null>
  >({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [autostartFailed, setAutostartFailed] = useState(false);

  useEffect(() => {
    setEditingKeys({ ...apiKeys });
  }, [apiKeys, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    setAutostartFailed(false);

    (async () => {
      try {
        const { isEnabled } = await import("@tauri-apps/plugin-autostart");
        const enabled = await isEnabled();
        if (enabled !== autostart) {
          setAutostart(enabled);
          await saveToStore();
        }
      } catch (e) {
        console.log("Autostart not available:", e);
      }
    })();
  }, [settingsOpen, autostart, setAutostart, saveToStore]);

  const handleSaveKey = useCallback(
    async (provider: ApiProvider) => {
      const key = editingKeys[provider];
      if (!key.trim()) return;

      setValidating(provider);
      setValidationResult((prev) => ({ ...prev, [provider]: null }));

      const isValid = await validateApiKey(provider, key);

      setValidationResult((prev) => ({ ...prev, [provider]: isValid }));
      setValidating(null);

      if (isValid) {
        setApiKey(provider, key);
        await saveToStore();
        setTimeout(
          () =>
            setValidationResult((prev) => ({ ...prev, [provider]: null })),
          3000
        );
      }
    },
    [editingKeys, setApiKey, saveToStore]
  );

  const handleSetActive = useCallback(
    async (api: ApiProvider) => {
      setActiveApi(api);
      setTranslatorApi(api);
      await saveToStore();
    },
    [setActiveApi, setTranslatorApi, saveToStore]
  );

  const handleDarkModeToggle = useCallback(async () => {
    setDarkMode(!darkMode);
    await saveToStore();
  }, [darkMode, setDarkMode, saveToStore]);

  const handleAutostartToggle = useCallback(async () => {
    const newValue = !autostart;
    setAutostartFailed(false);

    try {
      const { enable, disable } = await import("@tauri-apps/plugin-autostart");
      if (newValue) {
        await enable();
      } else {
        await disable();
      }
    } catch (e) {
      console.log("Autostart not available:", e);
      setAutostartFailed(true);
      return;
    }

    setAutostart(newValue);
    await saveToStore();
  }, [autostart, setAutostart, saveToStore]);

  const handleStartMinimizedToggle = useCallback(async () => {
    setStartMinimized(!startMinimized);
    await saveToStore();
  }, [startMinimized, setStartMinimized, saveToStore]);

  const handleScale = useCallback(
    async (scale: number) => {
      setUiScale(scale);
      await saveToStore();
    },
    [setUiScale, saveToStore]
  );

  const applyOpenHotkey = useCallback(
    async (accel: string) => {
      setOpenHotkey(accel);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_open_hotkey", { accelerator: accel });
      } catch (e) {
        console.log("Failed to set open hotkey:", e);
      }
      await saveToStore();
    },
    [setOpenHotkey, saveToStore]
  );

  const handleHotkeyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recordingHotkey) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingHotkey(false);
        return;
      }

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      if (e.metaKey) mods.push("Super");

      let key: string | null = null;
      if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
      else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
      else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;

      if (!key || mods.length === 0) return;

      setRecordingHotkey(false);
      applyOpenHotkey([...mods, key].join("+"));
    },
    [recordingHotkey, applyOpenHotkey]
  );

  const applyPopupHotkey = useCallback(
    async (accel: string) => {
      setPopupHotkey(accel);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_popup_hotkey", { accelerator: accel });
      } catch (e) {
        console.log("Failed to set popup hotkey:", e);
      }
      await saveToStore();
    },
    [setPopupHotkey, saveToStore]
  );

  const handlePopupHotkeyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!recordingPopupHotkey) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecordingPopupHotkey(false);
        return;
      }

      const mods: string[] = [];
      if (e.ctrlKey) mods.push("Ctrl");
      if (e.shiftKey) mods.push("Shift");
      if (e.altKey) mods.push("Alt");
      if (e.metaKey) mods.push("Super");

      let key: string | null = null;
      if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
      else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
      else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;

      if (!key || mods.length === 0) return;

      setRecordingPopupHotkey(false);
      applyPopupHotkey([...mods, key].join("+"));
    },
    [recordingPopupHotkey, applyPopupHotkey]
  );

  const handleClearData = useCallback(async () => {
    try {
      const store = await loadCache();
      await store.clear();
      await store.save();
      await clearStore();
      window.location.reload();
    } catch {
      console.log("Store not available");
    }
  }, [clearStore]);

  const alwaysFreeProviders = ["google", "bing"];

  return (
    <>
      <div
        className={`absolute inset-0 z-40 transition-opacity duration-300 bg-black/50 ${settingsOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSettingsOpen(false)}
      />

      <div
        className={`absolute right-0 top-0 bottom-0 w-100 max-w-[90vw] z-50 overflow-y-auto transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)] bg-surface-low rounded-l-(--md-shape-lg) ${settingsOpen ? "translate-x-0 shadow-2xl" : "translate-x-full"}`}
      >
        <div
          className="sticky top-0 z-10 px-6 py-5 flex items-center justify-between bg-surface-low border-b border-(--md-outline-variant)"
        >
          <h2
            className="text-xl font-normal text-foreground tracking-tight"
          >
            Settings
          </h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="md-icon-btn"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-8">
          <section>
            <h3
              className="text-sm font-medium mb-4 text-primary tracking-wide"
            >
              Translation API
            </h3>

            <div className="flex flex-col gap-2">
              {API_PROVIDERS.map((provider) => {
                const isActive = activeApi === provider.id;
                const hasKey = !!apiKeys[provider.id];
                const isAlwaysFree = alwaysFreeProviders.includes(provider.id);
                const isWebMode = isAlwaysFree;

                return (
                  <div
                    key={provider.id}
                    className={`overflow-hidden rounded-(--md-shape-md) transition-all duration-300 border ${isActive ? "bg-surface-high border-primary ring-1 ring-primary" : "bg-surface border-(--md-outline-variant)"}`}
                  >
                    <button
                      onClick={() => handleSetActive(provider.id)}
                      className="flex items-center justify-between w-full px-3 py-2 bg-transparent border-none cursor-pointer text-foreground"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4.5 h-4.5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-200 ${isActive ? "border-primary" : "border-outline"}`}
                        >
                          {isActive && (
                            <div
                              className="w-2.5 h-2.5 rounded-full animate-scale-in"
                              style={{ background: "var(--md-primary)" }}
                            />
                          )}
                        </div>
                        <span className="text-[13px] font-medium">{provider.name}</span>
                      </div>

                      {isAlwaysFree ? (
                        <span
                          className="md-badge"
                          style={{
                            background: "var(--md-tertiary-container)",
                            color: "var(--md-on-tertiary-container)",
                          }}
                        >
                          <Check size={10} />
                          Free
                        </span>
                      ) : hasKey ? (
                        <span
                          className="md-badge"
                          style={{
                            background: "var(--md-primary-container)",
                            color: "var(--md-on-primary-container)",
                          }}
                        >
                          <Check size={10} />
                          Key set
                        </span>
                      ) : null}
                    </button>

                    {!isWebMode && (
                    <div
                      className="px-3 pb-2.5"
                      style={{
                        borderTop: "1px solid var(--md-outline-variant)",
                        paddingTop: "8px",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex-1 flex items-center gap-2 overflow-hidden bg-surface-highest rounded-(--md-shape-sm) border border-(--md-outline-variant) px-2.5 h-9 transition-colors duration-200 focus-within:border-primary"
                        >
                          <Key size={12} className="text-secondary shrink-0" />
                          <input
                            type={showKeys[provider.id] ? "text" : "password"}
                            value={editingKeys[provider.id]}
                            onChange={(e) =>
                              setEditingKeys((prev) => ({
                                ...prev,
                                [provider.id]: e.target.value,
                              }))
                            }
                            placeholder={provider.id === "lara" ? "AccessKeyID,AccessKeySecret" : provider.id === "custom" ? "Custom translation API URL" : "API key"}
                            className="flex-1 text-xs focus:outline-none bg-transparent text-foreground border-none h-full"
                          />
                          <button
                            onClick={() =>
                              setShowKeys((prev) => ({
                                ...prev,
                                [provider.id]: !prev[provider.id],
                              }))
                            }
                            className="text-secondary bg-transparent border-none cursor-pointer p-1 shrink-0"
                          >
                            {showKeys[provider.id] ? (
                              <EyeOff size={14} />
                            ) : (
                              <Eye size={14} />
                            )}
                          </button>
                        </div>

                        <button
                          onClick={() => handleSaveKey(provider.id)}
                          disabled={
                            !(editingKeys[provider.id] || "").trim() ||
                            validating === provider.id
                          }
                          className="md-btn-tonal shrink-0 h-9 px-3.5 text-xs"
                        >
                          {validating === provider.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : validationResult[provider.id] === true ? (
                            <>
                              <Check size={14} />
                              Saved
                            </>
                          ) : validationResult[provider.id] === false ? (
                            "Invalid"
                          ) : (
                            "Save"
                          )}
                        </button>
                      </div>

                      {validationResult[provider.id] === false && (
                        <p className="text-xs mt-2 text-error">
                          Invalid API key. Please check and try again.
                        </p>
                      )}
                      {validationResult[provider.id] === true && (
                        <p className="text-xs mt-2 text-primary">
                          Key validated and saved successfully.
                        </p>
                      )}
                    </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="md-divider" />

          <section>
            <h3 className="text-sm font-medium mb-4 text-primary tracking-wide">
              Preferences
            </h3>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleDarkModeToggle}
                className="md-card flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3 text-sm text-foreground">
                  {darkMode ? <Moon size={18} /> : <Sun size={18} />}
                  {darkMode ? "Dark theme" : "Light theme"}
                </div>
                <div className={`md-switch ${darkMode ? "on" : ""}`}>
                  <div className="md-switch-thumb" />
                </div>
              </button>

              <button
                onClick={handleAutostartToggle}
                className="md-card flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <Monitor size={18} />
                  Start on startup
                </div>
                <div className={`md-switch ${autostart ? "on" : ""}`}>
                  <div className="md-switch-thumb" />
                </div>
              </button>

              {autostartFailed && (
                <div className="text-[11px] text-error px-1">
                  Could not change the startup setting
                </div>
              )}

              {autostart && (
                <button
                  onClick={handleStartMinimizedToggle}
                  className="md-card flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3 text-sm text-foreground">
                    <Minimize2 size={18} />
                    Start minimized to tray
                  </div>
                  <div className={`md-switch ${startMinimized ? "on" : ""}`}>
                    <div className="md-switch-thumb" />
                  </div>
                </button>
              )}

              <div className="md-card flex items-center justify-between">
                <div className="flex items-center gap-3 text-sm text-foreground">
                  <ZoomIn size={18} />
                  Interface scale
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleScale(uiScale - 0.1)}
                    className="md-icon-btn shrink-0"
                    title="Decrease"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-xs font-mono text-secondary w-10 text-center">
                    {Math.round(uiScale * 100)}%
                  </span>
                  <button
                    onClick={() => handleScale(uiScale + 0.1)}
                    className="md-icon-btn shrink-0"
                    title="Increase"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => handleScale(1)}
                    className="md-btn-tonal h-9 px-3 text-xs"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </section>

          <div className="md-divider" />

          <section>
            <h3 className="text-sm font-medium mb-4 text-primary tracking-wide">
              Shortcut
            </h3>

            <div className="md-card flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Keyboard size={18} />
                Open MoonTranslator
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRecordingHotkey(true)}
                  onKeyDown={handleHotkeyKeyDown}
                  onBlur={() => setRecordingHotkey(false)}
                  className="md-btn-tonal h-9 px-3.5 text-xs min-w-24 justify-center"
                >
                  {recordingHotkey
                    ? "Press keys..."
                    : openHotkey || "None"}
                </button>
                <button
                  onClick={() => applyOpenHotkey("")}
                  className="md-icon-btn shrink-0"
                  title="Clear shortcut"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="md-card flex items-center justify-between mt-2">
              <div className="flex items-center gap-3 text-sm text-foreground">
                <Copy size={18} />
                Popup (double-press)
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRecordingPopupHotkey(true)}
                  onKeyDown={handlePopupHotkeyKeyDown}
                  onBlur={() => setRecordingPopupHotkey(false)}
                  className="md-btn-tonal h-9 px-3.5 text-xs min-w-24 justify-center"
                >
                  {recordingPopupHotkey
                    ? "Press keys..."
                    : popupHotkey || "None"}
                </button>
                <button
                  onClick={() => applyPopupHotkey("")}
                  className="md-icon-btn shrink-0"
                  title="Clear shortcut"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <p className="text-xs text-secondary mt-2 px-1">
              Popup translates the clipboard. Make sure your shortcut copies the
              selection first (for example Ctrl+C).
            </p>
          </section>

          <div className="md-divider" />

          <section>
            <h3 className="text-sm font-medium mb-4 text-primary tracking-wide">
              Actions
            </h3>
            <div className="flex flex-col gap-2">
              <a
                href="https://discord.gg/F9FD52qWwK"
                onClick={(e) => {
                  e.preventDefault();
                  import("@tauri-apps/plugin-shell").then(({ open }) => open("https://discord.gg/F9FD52qWwK")).catch(() => window.open("https://discord.gg/F9FD52qWwK", "_blank"));
                }}
                className="md-card flex items-center gap-3 text-sm cursor-pointer no-underline text-foreground hover:bg-surface-high transition-colors"
                title="Join our Discord"
              >
                <div className="w-4.5 h-4.5 flex shrink-0">
                  <svg
                    viewBox="0 0 24 24"
                    fill="#FFFFFF"
                    className="w-full h-full"
                  >
                    <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12z" />
                  </svg>
                </div>
                Join our Discord
              </a>

              <button
                onClick={() => setShowChangelogModal(true)}
                className="md-card flex items-center gap-3 text-sm cursor-pointer text-foreground"
              >
                <FileText size={18} className="text-secondary" />
                View Changelog
              </button>

              <button
                onClick={handleClearData}
                className="md-card flex items-center gap-3 text-sm cursor-pointer text-error"
              >
                <Trash2 size={18} />
                Clear all data
              </button>
            </div>
          </section>

          <div className="pt-4 text-center text-xs font-mono border-t border-(--md-outline-variant) text-secondary tracking-widest">
            MoonTranslator v{APP_VERSION}
          </div>
        </div>
      </div>
      
      <ChangelogModal 
        isOpen={showChangelogModal} 
        onClose={() => setShowChangelogModal(false)} 
      />
    </>
  );
}
