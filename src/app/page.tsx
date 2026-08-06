"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useTranslatorStore, API_PROVIDERS } from "@/store/translatorStore";
import { useSettingsStore } from "@/store/settingsStore";
import { translateText } from "@/lib/translate";
import TranslatorInput from "@/components/TranslatorInput";
import TranslatorOutput from "@/components/TranslatorOutput";
import LanguageSelector from "@/components/LanguageSelector";
import SettingsPanel from "@/components/SettingsPanel";
import UpdateBanner from "@/components/UpdateBanner";
import ChangelogModal from "@/components/ChangelogModal";
import { ArrowRightLeft, Settings, TriangleAlert, Zap, ZapOff, X } from "lucide-react";
import Image from "next/image";

export default function Home() {
  const {
    sourceText,
    sourceLang,
    targetLang,
    isTranslating,
    autoTranslate,
    activeApi,
    setSourceLang,
    setTargetLang,
    setTranslatedText,
    setIsTranslating,
    setError,
    setDetectedLanguage,
    setAlternatives,
    setAutoTranslate,
    swapLanguages,
  } = useTranslatorStore();

  const { setSettingsOpen, apiKeys, loadFromStore, activeApi: settingsActiveApi, providerModes, uiScale } =
    useSettingsStore();

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zoomSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [showChangelogModal, setShowChangelogModal] = useState(false);

  const persistZoom = useCallback(() => {
    clearTimeout(zoomSaveRef.current);
    zoomSaveRef.current = setTimeout(
      () => useSettingsStore.getState().saveToStore(),
      400
    );
  }, []);

  const applyZoomDelta = useCallback(
    (delta: number) => {
      const s = useSettingsStore.getState();
      s.setUiScale(s.uiScale + delta);
      persistZoom();
    },
    [persistZoom]
  );

  const resetZoom = useCallback(() => {
    useSettingsStore.getState().setUiScale(1);
    persistZoom();
  }, [persistZoom]);

  useEffect(() => {
    loadFromStore();
  }, [loadFromStore]);

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_main_zoom", { factor: uiScale });
      } catch (e) {
        console.log("Failed to apply zoom:", e);
      }
    })();
  }, [uiScale]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoomDelta(e.deltaY < 0 ? 0.1 : -0.1);
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [applyZoomDelta]);

  useEffect(() => {
    if (settingsActiveApi) {
      useTranslatorStore.getState().setActiveApi(settingsActiveApi);
    }
  }, [settingsActiveApi]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ text: string; sourceLang: string; targetLang: string }>("set-main-text", (event) => {
          const state = useTranslatorStore.getState();
          state.setSourceText(event.payload.text);
          if (event.payload.sourceLang !== "auto") {
            state.setSourceLang(event.payload.sourceLang);
          }
          state.setTargetLang(event.payload.targetLang);
        });
      } catch (e) {
        console.error("Failed to listen for set-main-text", e);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);


  const [apiDropdownOpen, setApiDropdownOpen] = useState(false);
  const providerButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.location.hash === "#settings") {
      setSettingsOpen(true);
      window.location.hash = "";
    }
  }, [setSettingsOpen]);

  const doTranslate = useCallback(async () => {
    const state = useTranslatorStore.getState();
    const settingsState = useSettingsStore.getState();

    if (!state.sourceText.trim()) {
      setTranslatedText("");
      setAlternatives([]);
      return;
    }

    const apiKey = settingsState.apiKeys[state.activeApi];
    const mode = settingsState.providerModes[state.activeApi];
    const isFree = state.activeApi === "google" || state.activeApi === "bing" || mode === "web";

    if (!apiKey && !isFree) {
      setError(`No API key set for ${API_PROVIDERS.find((p) => p.id === state.activeApi)?.name}. Go to Settings to add one.`);
      return;
    }

    setIsTranslating(true);
    setError(null);
    setAlternatives([]);

    try {
      const result = await translateText(
        state.sourceText,
        state.sourceLang,
        state.targetLang,
        state.activeApi,
        apiKey,
        isFree
      );
      setTranslatedText(result.translatedText);
      setAlternatives(result.alternatives);
      if (result.detectedLanguage) {
        setDetectedLanguage(result.detectedLanguage);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e) || "Translation failed");
    } finally {
      setIsTranslating(false);
    }
  }, [setTranslatedText, setIsTranslating, setError, setDetectedLanguage, setAlternatives]);

  useEffect(() => {
    if (!autoTranslate || !sourceText.trim()) return;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doTranslate(), 800);

    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceText, sourceLang, targetLang, activeApi, autoTranslate]);
  useEffect(() => {
    if (!sourceText.trim()) {
      setTranslatedText("");
      setError(null);
      setAlternatives([]);
    }
  }, [sourceText, setTranslatedText, setError, setAlternatives]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doTranslate();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        applyZoomDelta(0.1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        applyZoomDelta(-0.1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doTranslate, applyZoomDelta, resetZoom]);

  const [isSwapping, setIsSwapping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleSwap = () => {
    if (isSwapping) return;
    setIsSwapping(true);
    
    setTimeout(() => {
      setIsSwapping(false);
      setIsResetting(true);
      swapLanguages();
      
      setTimeout(() => {
        setIsResetting(false);
      }, 50);
    }, 300);
  };

  useEffect(() => {
    const closeApiDropdown = (e: MouseEvent) => {
      if (providerButtonRef.current && !providerButtonRef.current.contains(e.target as Node)) {
        setApiDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", closeApiDropdown);
    return () => document.removeEventListener("mousedown", closeApiDropdown);
  }, []);

  const currentProvider = API_PROVIDERS.find((p) => p.id === activeApi);

  return (
    <div className="h-screen w-screen p-0.5 bg-transparent">
      <div className="flex flex-col h-full overflow-hidden shadow-2xl relative border border-[rgba(255,255,255,0.05)] animate-launch bg-background rounded-(--md-shape-lg)">
      <UpdateBanner onViewChangelog={() => setShowChangelogModal(true)} />
      <ChangelogModal isOpen={showChangelogModal} onClose={() => setShowChangelogModal(false)} />

      <header
        className="flex items-center justify-between px-6 h-18 shrink-0"
        data-tauri-drag-region
      >
        <div className="flex items-center gap-4 min-w-0" data-tauri-drag-region>
          <div
            className="w-7.5 h-7.5 rounded-full flex items-center justify-center shrink-0"
          >
            <Image width={10} height={10} src="/logo.webp" alt="MoonTranslator" className="w-full h-full" />
          </div>
          <h1
            className="text-[22px] font-normal tracking-tight mb-0.5 truncate min-w-0 max-[800px]:hidden"
            style={{ color: "var(--md-on-surface)", letterSpacing: "-0.01em" }}
            data-tauri-drag-region
          >
            MoonTranslator
          </h1>
          <div className="relative shrink-0" ref={providerButtonRef}>
            <button
              onClick={() => setApiDropdownOpen(!apiDropdownOpen)}
              className="md-badge state-layer cursor-pointer hover:brightness-110 transition-all border-none outline-none bg-surface-high text-secondary"
            >
              {currentProvider?.name} ▾
            </button>
            <div 
              className={`absolute top-full left-0 mt-1 min-w-35 shadow-xl transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)] origin-top border border-(--md-outline-variant) z-50 flex flex-col py-2 bg-surface-high rounded-(--md-shape-md) ${
                apiDropdownOpen ? "opacity-100 translate-y-0 scale-y-100 pointer-events-auto" : "opacity-0 -translate-y-1 scale-y-95 pointer-events-none"
              }`}
            >
              {API_PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    useTranslatorStore.getState().setActiveApi(p.id);
                    setApiDropdownOpen(false);
                  }}
                  className={`flex flex-1 items-center justify-between px-3 py-2 mx-1 mb-0.5 rounded-md hover:bg-[rgba(255,255,255,0.08)] text-left text-sm transition-colors ${
                    p.id === activeApi ? "text-primary" : "text-foreground"
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoTranslate(!autoTranslate)}
            className={`md-chip ${autoTranslate ? "selected" : ""}`}
            title={autoTranslate ? "Auto-translate on" : "Auto-translate off"}
          >
            {autoTranslate ? <Zap size={16} /> : <ZapOff size={16} />}
            Auto
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="md-icon-btn state-layer ml-2"
            title="Settings"
          >
            <Settings size={22} />
          </button>

          <button
            onClick={async () => {
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                await invoke("hide_main_window");
              } catch {
                window.close();
              }
            }}
            className="md-icon-btn state-layer"
            title="Close to tray"
          >
            <X size={22} />
          </button>
        </div>
      </header>

      <main className="flex flex-col flex-1 mx-4 mb-4 overflow-hidden relative shadow-sm bg-surface-low rounded-(--md-shape-xl)">
        <div className="flex items-center gap-3 px-6 py-3 shrink-0 relative z-30">

          <div className="flex-1 flex items-center justify-center gap-4 min-w-0">
            <div className={`w-40 z-10 ${!isResetting ? "transition-all duration-300 ease-in-out" : ""} ${isSwapping ? "translate-x-[232px]" : "translate-x-0"}`}>
              <LanguageSelector
                value={sourceLang}
                onChange={setSourceLang}
                showAutoDetect
                compact
              />
            </div>

            <button
              onClick={handleSwap}
              disabled={sourceLang === "auto"}
              className={`md-icon-btn state-layer text-primary z-0 ${!isResetting ? "transition-all duration-300" : ""} ${isSwapping ? "rotate-180 scale-90 opacity-40" : "hover:scale-110"}`}
              title="Swap languages"
            >
              <ArrowRightLeft size={22} />
            </button>

            <div className={`w-40 z-10 ${!isResetting ? "transition-all duration-300 ease-in-out" : ""} ${isSwapping ? "-translate-x-[232px]" : "translate-x-0"}`}>
              <LanguageSelector
                value={targetLang}
                onChange={setTargetLang}
                compact
              />
            </div>
          </div>

          {!autoTranslate && (
            <button
              onClick={doTranslate}
              disabled={isTranslating || !sourceText.trim()}
              title="Translate"
              className="md-btn-filled state-layer shrink-0 flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all active:scale-95 duration-200 max-[600px]:!w-10 max-[600px]:!px-0 max-[600px]:gap-0"
            >
              <Zap size={18} className={`${isTranslating ? "animate-pulse" : ""}`} />
              <span className="max-[600px]:hidden">Translate</span>
            </button>
          )}
        </div>

        <div className="flex flex-row flex-1 min-h-0 relative">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <TranslatorInput />
          </div>

          <div className="w-px shrink-0 bg-(--md-outline-variant) my-6 opacity-30" />

          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <TranslatorOutput />
          </div>
        </div>
      </main>

      <div className="flex items-center justify-between px-6 pb-4 pt-1 shrink-0">
        <span
          className="text-xs font-mono text-secondary tracking-widest"
        >
          {isTranslating ? "Translating..." : "Ready"} — Ctrl+Enter to translate
        </span>
        <span>
          {!apiKeys[activeApi] && activeApi !== "google" && activeApi !== "bing" && providerModes[activeApi] !== "web" && (
            <span className="text-xs flex items-center gap-1.5 text-error">
              <TriangleAlert size={16} /> No API key —{" "}
              <button
                onClick={() => setSettingsOpen(true)}
                className="underline font-medium text-primary"
              >
                Settings
              </button>
            </span>
          )}
        </span>
      </div>

      <SettingsPanel />
      </div>
    </div>
  );
}
