"use client";

import { LANGUAGES } from "@/store/translatorStore";
import { ChevronDown, Check } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

interface LanguageSelectorProps {
  value: string;
  onChange: (value: string) => void;
  showAutoDetect?: boolean;
  label?: string;
  compact?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export default function LanguageSelector({
  value,
  onChange,
  showAutoDetect = false,
  label,
  compact = false,
  onOpenChange,
}: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menu, setMenu] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  }>({ left: 0, width: 0, maxHeight: 300 });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (onOpenChange) onOpenChange(isOpen);
  }, [isOpen, onOpenChange]);

  const filteredLanguages = showAutoDetect
    ? LANGUAGES
    : LANGUAGES.filter((l) => l.code !== "auto");

  const selectedPrefix =
    filteredLanguages.find((l) => l.code === value)?.name || value;

  useLayoutEffect(() => {
    if (!isOpen) return;
    const update = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const useUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const space = useUp ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(64, Math.min(300, space));
      setMenu({
        left: rect.left,
        width: rect.width,
        maxHeight,
        top: useUp
          ? undefined
          : Math.max(margin, Math.min(rect.bottom + 4, window.innerHeight - maxHeight - margin)),
        bottom: useUp ? Math.max(margin, window.innerHeight - rect.top + 4) : undefined,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative ${compact ? "" : "flex flex-col gap-1.5"} flex-1`}
      style={{ zIndex: 25 }}
    >
      {label && !compact && (
        <label className="text-xs font-medium px-2 text-secondary tracking-widest">
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{ position: "relative", zIndex: 25 }}
        className={`w-full flex items-center justify-between font-medium outline-none state-layer bg-secondary-container text-on-secondary-container border-none rounded-full cursor-pointer transition-all ${compact ? "py-2.5 px-4 pl-5 text-[13px]" : "py-3.5 px-5 pl-6 text-[15px]"} ${isOpen ? "ring-2 ring-inset ring-primary" : "ring-0"}`}
        onMouseDown={(e) => {
          if (!isOpen) e.currentTarget.style.transform = "scale(0.98)";
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        <span className="truncate pr-4">{selectedPrefix}</span>
        <ChevronDown
          size={compact ? 16 : 20}
          className={`shrink-0 transition-transform duration-300 pointer-events-none text-on-secondary-container ${isOpen ? "rotate-180" : "rotate-0"}`}
        />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: menu.left,
              width: menu.width,
              top: menu.top,
              bottom: menu.bottom,
              zIndex: 9999,
              pointerEvents: isOpen ? "auto" : "none",
            }}
            className={`shadow-xl transition-all duration-200 ease-out border bg-surface-high rounded-(--md-shape-md) border-(--md-outline-variant) ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"}`}
          >
            <div
              style={{ maxHeight: menu.maxHeight }}
              className="overflow-y-auto overflow-x-hidden flex flex-col py-2 px-1 custom-scrollbar"
            >
              {filteredLanguages.map((lang) => {
                const isSelected = value === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      onChange(lang.code);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between px-3 py-2.5 mb-0.5 rounded-full text-left w-full hover:bg-[rgba(255,255,255,0.08)] transition-colors ${compact ? "text-[13px]" : "text-[14px]"} ${isSelected ? "text-primary font-semibold" : "text-foreground font-normal"}`}
                  >
                    <span className="truncate">{lang.name}</span>
                    {isSelected && (
                      <Check size={16} className="shrink-0 ml-2 text-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
