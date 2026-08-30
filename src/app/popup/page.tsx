"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { usePopupStore } from "@/store/popupStore";
import { useSettingsStore } from "@/store/settingsStore";
import { API_PROVIDERS, useTranslatorStore } from "@/store/translatorStore";
import type { ApiProvider } from "@/store/translatorStore";
import {
  translateText,
  validateApiKey,
  detectLanguageSimple,
  getSmartTargetLang,
} from "@/lib/translate";
import { loadCache } from "@/lib/settingsCache";
import LanguageSelector from "@/components/LanguageSelector";
import DropdownPortal from "@/components/DropdownPortal";
import {
  X,
  GripHorizontal,
  Copy,
  Check,
  Key,
  Loader2,
  ArrowRight,
  ChevronUp,
  TriangleAlert,
  ArrowRightLeft,
  Pencil,
  Pin,
  PinOff,
  SquareArrowOutUpRight,
} from "lucide-react";
import Image from "next/image";

export default function PopupPage() {
  const {
    clipboardText,
    translatedText,
    sourceLang,
    targetLang,
    isTranslating,
    error,
    showKeyInput,
    keyInputValue,
    keySaveStatus,
    setClipboardText,
    setTranslatedText,
    setSourceLang,
    setTargetLang,
    setIsTranslating,
    setError,
    setShowKeyInput,
    setKeyInputValue,
    setKeySaveStatus,
    reset,
  } = usePopupStore();

  const { activeApi, setActiveApi, loadFromStore, setApiKey, saveToStore } =
    useSettingsStore();

  const [copied, setCopied] = useState(false);
  const [isTranslatorSelectOpen, setIsTranslatorSelectOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [isSwapping, setIsSwapping] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isPinned, setIsPinned] = useState(true);
  const [isEditingInput, setIsEditingInput] = useState(false);
  const initRef = useRef(false);
  const translatorSelectRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const translatorBtnRef = useRef<HTMLButtonElement>(null);
  const translatorPortalRef = useRef<HTMLDivElement>(null);
  const retranslateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFreeMode =
    activeApi === "google" ||
    activeApi === "bing";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideToggle = translatorSelectRef.current?.contains(target);
      const insidePortal = translatorPortalRef.current?.contains(target);
      if (!insideToggle && !insidePortal) {
        setIsTranslatorSelectOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const readClipboard = useCallback(async () => {
    try {
      const { readText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      const text = await readText();
      if (text) {
        setTranslatedText("");
        setError(null);
        setIsEditing(false);
        
        setClipboardText(text);

        const detected = detectLanguageSimple(text);
        const smartTarget = getSmartTargetLang(detected);
        setTargetLang(smartTarget);

        try {
          const store = await loadCache();
          const savedSource = await store.get<string>("popupSourceLang");
          const savedTarget = await store.get<string>("popupTargetLang");
          if (savedSource) setSourceLang(savedSource);
          if (savedTarget) setTargetLang(savedTarget);
        } catch {}
      }
    } catch {
      setClipboardText("(Could not read clipboard)");
    }
  }, [setClipboardText, setSourceLang, setTargetLang, setTranslatedText, setError, setIsEditing]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      await loadFromStore();
      await readClipboard();
    };
    init();
  }, [loadFromStore, readClipboard]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.listen("popup-refresh", () => {
          reset();
          setIsEditing(false);
          setIsEditingInput(false);
          readClipboard();
        });
      } catch {}
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [readClipboard, reset]);

  const doTranslate = useCallback(async () => {
    const text = usePopupStore.getState().clipboardText;
    if (!text.trim() || text === "(Could not read clipboard)") return;

    const settingsState = useSettingsStore.getState();
    const api = settingsState.activeApi;
    const apiKey = settingsState.apiKeys[api];
    const isFree = api === "google" || api === "bing";

    if (!apiKey && !isFree) {
      setError(
        `No API key for ${API_PROVIDERS.find((p) => p.id === api)?.name}`
      );
      return;
    }

    setIsTranslating(true);
    setError(null);
    setIsEditing(false);

    try {
      const result = await translateText(
        text,
        usePopupStore.getState().sourceLang,
        usePopupStore.getState().targetLang,
        api,
        apiKey,
        isFree
      );
      setTranslatedText(result.translatedText);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e) || "Translation failed");
    } finally {
      setIsTranslating(false);
    }
  }, [setTranslatedText, setIsTranslating, setError]);

  useEffect(() => {
    if (clipboardText && clipboardText !== "(Could not read clipboard)") {
      if (isEditingInput) {
        if (retranslateTimerRef.current) clearTimeout(retranslateTimerRef.current);
        retranslateTimerRef.current = setTimeout(() => {
          doTranslate();
        }, 600);
        return () => {
          if (retranslateTimerRef.current) clearTimeout(retranslateTimerRef.current);
        };
      } else {
        doTranslate();
      }
    }
  }, [clipboardText, sourceLang, targetLang, activeApi, doTranslate, isEditingInput]);

  const handleCopy = async () => {
    const textToCopy = isEditing ? editText : translatedText;
    if (!textToCopy) return;
    try {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error("Failed to copy");
      }
    }
  };

  const handleReplace = async () => {
    const textToReplace = isEditing ? editText : translatedText;
    if (!textToReplace) return;
    try {
      try {
        const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
        await writeText(textToReplace);
      } catch {
        await navigator.clipboard.writeText(textToReplace);
      }
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_popup_window");
      await invoke("simulate_paste");
    } catch {
      console.error("Failed to replace");
    }
  };

  const handleClose = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("close_popup_window");
    } catch {
      window.close();
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClose();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const saveLangPref = async (key: string, val: string) => {
    try {
      const store = await loadCache();
      await store.set(key, val);
      await store.save();
    } catch {}
  };

  const handleSaveKey = async () => {
    if (!keyInputValue.trim()) return;

    setKeySaveStatus("saving");
    const isValid = await validateApiKey(activeApi, keyInputValue);

    if (isValid) {
      setApiKey(activeApi, keyInputValue);
      await saveToStore();
      setKeySaveStatus("success");
      setTimeout(() => {
        setShowKeyInput(false);
        setKeySaveStatus("idle");
        setKeyInputValue("");
        doTranslate();
      }, 2000);
    } else {
      setKeySaveStatus("error");
      setTimeout(() => setKeySaveStatus("idle"), 3000);
    }
  };

  const handleStartEdit = () => {
    setEditText(translatedText);
    setIsEditing(true);
    setTimeout(() => {
      editTextareaRef.current?.focus();
    }, 50);
  };

  const handleTogglePin = async () => {
    try {
      const newState = !isPinned;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_popup_pinned", { pinned: newState });
      setIsPinned(newState);
    } catch {
      console.error("Failed to toggle pin");
    }
  };

  const handleOpenMain = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { emit } = await import("@tauri-apps/api/event");
      
      const textToSet = (clipboardText && clipboardText !== "(Could not read clipboard)") ? clipboardText : "";
      if (textToSet) {
        await emit("set-main-text", { text: textToSet, sourceLang, targetLang });
      }
      
      await invoke("open_main_window");
      await invoke("close_popup_window");
    } catch {
      console.error("Failed to open main window");
    }
  };

  return (
    <div
      className="flex flex-col select-none relative bg-surface text-foreground rounded-(--md-shape-md) overflow-clip"
      style={{ height: "100vh", minHeight: 0 }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-4 py-2 shrink-0 bg-surface-high border-b border-(--md-outline-variant) rounded-t-(--md-shape-md)"
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <GripHorizontal size={14} className="text-secondary" />
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center p-0.5"
          >
            <Image src="/logo.webp" width={16} height={16} alt="Logo" className="w-full h-full object-contain" />
          </div>
          <span
            className="text-xs font-medium tracking-wide"
            data-tauri-drag-region
          >
            MoonTranslator
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleTogglePin}
            className={`md-icon-btn w-7 h-7 ${isPinned ? "text-primary" : "text-secondary"}`}
            title={isPinned ? "Unpin window" : "Pin window"}
          >
            {isPinned ? <Pin size={14} className="fill-current" /> : <PinOff size={14} />}
          </button>
          <button
            onClick={handleOpenMain}
            className="md-icon-btn w-7 h-7"
            title="Open in main window"
          >
            <SquareArrowOutUpRight size={14} />
          </button>
          <button
            onClick={handleClose}
            className="md-icon-btn w-7 h-7"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className="flex items-center gap-2 px-4 py-2.5 shrink-0 border-b border-(--md-outline-variant) relative"
        style={{ zIndex: 30 }}
      >
        <div className={`flex-1 z-10 ${!isResetting ? "transition-all duration-300 ease-in-out" : ""} ${isSwapping ? "translate-x-49" : "translate-x-0"}`}>
          <LanguageSelector
            value={sourceLang}
            onChange={(val) => {
              setSourceLang(val);
              saveLangPref("popupSourceLang", val);
            }}
            showAutoDetect
            compact
          />
        </div>
        <button
          onClick={() => {
            if (isSwapping) return;
            setIsSwapping(true);
            
            setTimeout(() => {
              setIsSwapping(false);
              setIsResetting(true);
              const temp = sourceLang;
              setSourceLang(targetLang);
              setTargetLang(temp);
              saveLangPref("popupSourceLang", targetLang);
              saveLangPref("popupTargetLang", temp);
              
              setTimeout(() => {
                setIsResetting(false);
              }, 50);
            }, 300);
          }}
          disabled={sourceLang === "auto"}
          className={`md-icon-btn w-7 h-7 shrink-0 z-0 ${!isResetting ? "transition-all duration-300" : ""} ${isSwapping ? "rotate-180 scale-90 opacity-40" : "hover:scale-110"}`}
          title="Swap languages"
        >
          <ArrowRightLeft size={14} />
        </button>
        <div className={`flex-1 z-10 ${!isResetting ? "transition-all duration-300 ease-in-out" : ""} ${isSwapping ? "-translate-x-49" : "translate-x-0"}`}>
          <LanguageSelector
            value={targetLang}
            onChange={(val) => {
              setTargetLang(val);
              saveLangPref("popupTargetLang", val);
            }}
            compact
          />
        </div>
      </div>

      <div
        className="px-4 py-2.5 max-h-20 overflow-y-auto shrink-0 bg-surface-low border-b border-(--md-outline-variant) group relative"
      >
        {isEditingInput ? (
          <textarea
            ref={inputTextareaRef}
            value={clipboardText}
            onChange={(e) => {
              setClipboardText(e.target.value);
              // auto-resize to fit
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
            onBlur={() => {
              if (!clipboardText.trim()) setIsEditingInput(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsEditingInput(false);
              }
            }}
            className="w-full leading-snug text-xs text-secondary bg-transparent border-none outline-none resize-none select-text"
            rows={1}
            autoFocus
            onFocus={(e) => {
              // auto-resize on focus
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
          />
        ) : (
          <p
            className="leading-snug line-clamp-3 text-xs text-secondary cursor-text select-text"
            onClick={() => {
              setIsEditingInput(true);
              setTimeout(() => inputTextareaRef.current?.focus(), 50);
            }}
          >
            {clipboardText || "No clipboard text"}
          </p>
        )}
      </div>

      <div className="flex-1 px-4 py-3 overflow-y-auto min-h-0">
        {isTranslating ? (
          <div className="flex flex-col gap-2">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-3/4" />
          </div>
        ) : error ? (
          <div
            className="flex flex-col gap-2 p-3 text-xs bg-error-container text-error border border-error/20"
          >
            <div className="flex items-start gap-2">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              <span className="leading-snug wrap-break-word">{error}</span>
            </div>
            <div className="pl-5">
              <a 
                onClick={(e) => {
                  e.preventDefault();
                  import("@tauri-apps/plugin-shell").then(({ open }) => open("https://github.com/noxygalaxy/moontranslator/issues")).catch(() => window.open("https://github.com/noxygalaxy/moontranslator/issues", "_blank"));
                }}
                className="underline opacity-90 hover:opacity-100 transition-opacity text-[11px] text-error cursor-pointer"
              >
                Report this issue on GitHub
              </a>
            </div>
          </div>
        ) : isEditing ? (
          <textarea
            ref={editTextareaRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="w-full h-full leading-snug text-[13px] text-foreground bg-transparent border-none outline-none resize-none"
          />
        ) : (
          <div className="flex items-start gap-2">
            <p
              className="leading-snug text-[13px] text-foreground flex-1"
            >
              {translatedText}
            </p>
            {translatedText && (
              <button
                onClick={handleStartEdit}
                className="md-icon-btn w-6 h-6 shrink-0 mt-px"
                title="Edit translation"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {showKeyInput && !isFreeMode && (
        <div
          className="px-4 py-2.5 shrink-0 bg-surface-high border-t border-(--md-outline-variant)"
        >
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={keyInputValue}
              onChange={(e) => setKeyInputValue(e.target.value)}
              placeholder={activeApi === "lara" ? "ID,Secret" : "Enter API key..."}
              className="flex-1 text-xs focus:outline-none bg-surface-highest text-foreground border border-(--md-outline-variant) rounded-(--md-shape-sm) px-3 py-2"
              autoFocus
              data-form-type="other"
            />
            <button
              onClick={handleSaveKey}
              disabled={keySaveStatus === "saving"}
              className="md-btn-tonal h-8 px-3 text-[11px] rounded-(--md-shape-sm)"
            >
              {keySaveStatus === "saving" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : keySaveStatus === "success" ? (
                <span className="flex items-center gap-1"><Check size={12} /> Saved</span>
              ) : keySaveStatus === "error" ? (
                <span className="flex items-center gap-1"><X size={12} /> Invalid</span>
              ) : (
                "Save"
              )}
            </button>
            <button
              onClick={() => {
                setShowKeyInput(false);
                setKeyInputValue("");
                setKeySaveStatus("idle");
              }}
              className="text-xs text-secondary bg-transparent border-none cursor-pointer py-1 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div
        className="flex items-center justify-between px-4 py-2 shrink-0 bg-surface-high border-t border-(--md-outline-variant) rounded-b-(--md-shape-md)"
      >
        <div className="flex items-center gap-2">
          <div ref={translatorSelectRef} className="relative">
            <button
              ref={translatorBtnRef}
              onClick={() => {
                const newState = !isTranslatorSelectOpen;
                setIsTranslatorSelectOpen(newState);
              }}
              className="flex items-center justify-between font-medium outline-none state-layer gap-2 cursor-pointer bg-surface-high text-secondary border border-(--md-outline-variant) rounded-(--md-shape-sm) py-1.5 pl-3 pr-2 text-xs transition-all"
            >
              <span>
                {API_PROVIDERS.find((p) => p.id === activeApi)?.name || "Select API"}
              </span>
              <ChevronUp
                size={14}
                className={`text-secondary transition-transform duration-200 ${
                  isTranslatorSelectOpen ? "rotate-0" : "rotate-180"
                }`}
              />
            </button>

            <DropdownPortal
              anchorRef={translatorBtnRef}
              isOpen={isTranslatorSelectOpen}
              minWidth={144}
            >
              <div ref={translatorPortalRef}>
                <div
                  className={`overflow-hidden shadow-xl transition-all duration-200 ease-out origin-bottom border border-(--md-outline-variant) bg-surface-highest rounded-(--md-shape-md) ${
                    isTranslatorSelectOpen
                      ? "max-h-50 opacity-100 pointer-events-auto"
                      : "max-h-0 opacity-0 pointer-events-none"
                  }`}
                >
                  <div className="flex flex-col py-1 px-1">
                    {API_PROVIDERS.map((p) => {
                      const isSelected = activeApi === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={async () => {
                            useTranslatorStore.getState().setActiveApi(p.id);
                            setActiveApi(p.id);
                            await saveToStore();
                            setIsTranslatorSelectOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2 mb-0.5 rounded-full text-left w-full hover:bg-[rgba(255,255,255,0.08)] transition-colors text-xs ${
                            isSelected
                              ? "text-primary font-semibold"
                              : "text-foreground font-normal"
                          }`}
                        >
                          {p.name}
                          {isSelected && <Check size={14} className="text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </DropdownPortal>
          </div>
          
          {!isFreeMode && (
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="md-icon-btn w-7 h-7"
            >
              <Key size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReplace}
            disabled={!translatedText && !editText}
            className={`md-chip h-7 px-3 text-[11px] ${!translatedText && !editText ? "opacity-38" : ""}`}
          >
            <ArrowRightLeft size={12} />
            Replace
          </button>
          <button
            onClick={handleCopy}
            disabled={!translatedText && !editText}
            className={`md-chip h-7 px-3 text-[11px] ${!translatedText && !editText ? "opacity-38" : ""}`}
            style={copied ? {
              background: "var(--md-primary-container)",
              color: "var(--md-on-primary-container)",
              borderColor: "transparent",
            } : undefined}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}