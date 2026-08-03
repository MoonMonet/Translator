"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Image from "next/image";

interface ChangelogModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function ChangelogModal({ isOpen: externalIsOpen, onClose: externalOnClose }: ChangelogModalProps = {}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [changelog, setChangelog] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (externalIsOpen === undefined) {
      checkForChangelog();
    }
    fetchChangelog();
  }, [externalIsOpen]);

  useEffect(() => {
    if (externalIsOpen !== undefined) {
      if (externalIsOpen && !changelog) {
        fetchChangelog();
      }
      if (externalIsOpen) {
        setIsClosing(false);
        setShowChangelog(true);
      } else if (showChangelog) {
        setIsClosing(true);
        const timer = setTimeout(() => {
          setIsClosing(false);
          setShowChangelog(false);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [externalIsOpen, showChangelog]);

  const fetchChangelog = async () => {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("settings.json", { defaults: {} });
      const { APP_VERSION } = await import("@/lib/version");
      
      const cachedChangelog = await store.get<string>("cachedChangelog");
      const cachedVersion = await store.get<string>("cachedChangelogVersion");

      if (cachedVersion === APP_VERSION && cachedChangelog) {
        setChangelog(cachedChangelog);
        setVersion(APP_VERSION);
        return;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ status: number; body: string }>(
        "proxy_request",
        {
          args: {
            url: "https://api.github.com/repos/noxygalaxy/MoonTranslator/releases/latest",
            method: "GET",
            headers: { 
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "MoonTranslator"
            },
            body: null,
          },
        }
      );

      if (result.status === 200) {
        const release = JSON.parse(result.body);
        const bodyText = release.body || "No changelog available.";
        
        setChangelog(bodyText);
        setVersion(APP_VERSION);

        await store.set("cachedChangelog", bodyText);
        await store.set("cachedChangelogVersion", APP_VERSION);
        await store.save();
      }
    } catch (error) {
      console.error("Failed to fetch changelog:", error);
    }
  };

  const checkForChangelog = async () => {
    try {
      const { load } = await import("@tauri-apps/plugin-store");
      const store = await load("settings.json", { defaults: {} });
      
      const lastVersion = await store.get<string>("lastSeenVersion");
      const { APP_VERSION } = await import("@/lib/version");
      
      console.log("Checking changelog - Last seen:", lastVersion, "Current:", APP_VERSION);

      if (lastVersion && lastVersion !== APP_VERSION) {
        await fetchChangelog();
        setTimeout(() => {
          setShowChangelog(true);
        }, 300);

        await store.set("lastSeenVersion", APP_VERSION);
        await store.save();
      } else if (!lastVersion) {
        await store.set("lastSeenVersion", APP_VERSION);
        await store.save();
        console.log("First install detected, skipping changelog");
      }
    } catch (error) {
      console.error("Failed to check changelog:", error);
    }
  };

  const handleClose = () => {
    if (externalOnClose) {
      externalOnClose();
    } else {
      setIsClosing(true);
      setTimeout(() => {
        setIsClosing(false);
        setShowChangelog(false);
      }, 300);
    }
  };

  const styles = (
    <style jsx global>{`
      @keyframes modalFadeIn {
        from { opacity: 0; backdrop-filter: blur(0px); }
        to { opacity: 1; backdrop-filter: blur(4px); }
      }
      
      @keyframes modalSlideUp {
        from { 
          opacity: 0;
          transform: translateY(20px) scale(0.96);
        }
        to { 
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      @keyframes modalFadeOut {
        from { opacity: 1; backdrop-filter: blur(4px); }
        to { opacity: 0; backdrop-filter: blur(0px); }
      }
      
      @keyframes modalSlideDown {
        from { 
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to { 
          opacity: 0;
          transform: translateY(20px) scale(0.96);
        }
      }

      .changelog-bg-in {
        animation: modalFadeIn 0.3s ease-out forwards;
      }
      
      .changelog-modal-in {
        animation: modalSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .changelog-bg-out {
        animation: modalFadeOut 0.3s ease-in forwards;
      }
      
      .changelog-modal-out {
        animation: modalSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      .changelog-content {
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
      }
      
      .changelog-content::-webkit-scrollbar {
        width: 8px;
      }
      
      .changelog-content::-webkit-scrollbar-track {
        background: transparent;
      }
      
      .changelog-content::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 4px;
      }
      
      .changelog-content::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    `}</style>
  );

  if (!showChangelog && !isClosing && !externalIsOpen) return styles;

  return (
    <>
      {styles}
      <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 ${isClosing ? 'changelog-bg-out' : 'changelog-bg-in'}`}>
        <div className={`bg-surface-high rounded-(--md-shape-lg) w-[90vw] max-w-3xl max-h-[85vh] flex flex-col m-4 relative ${isClosing ? 'changelog-modal-out' : 'changelog-modal-in'}`}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="w-8 h-8"></div>
          
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-2xl font-semibold text-center">
              What&apos;s New in v{version}
            </h2>
            <Image 
              src="/keqingheart.png" 
              alt="Heart" 
              width={32} 
              height={32}
              className="w-8 h-8 shrink-0"
            />
          </div>
          
          <div className="w-8 h-8 flex justify-end items-center">
            <button
              onClick={handleClose}
              className="md-icon-btn w-8 h-8"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-8 pb-6 changelog-content text-center">
          <ReactMarkdown
            components={{
              h2: ({ children }) => {
                const text = String(children).replace(':', '');
                return (
                  <h2 className="text-2xl font-bold mt-4 mb-4 text-center">{text}</h2>
                );
              },
              h3: ({ children }) => {
                const text = String(children).replace(':', '');
                return (
                  <h3 className="text-xl font-bold mt-4 mb-4 text-center text-primary">{text}</h3>
                );
              },
              ul: ({ children }) => (
                <ul className="space-y-3 mb-6 text-center">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="text-center list-none leading-relaxed px-4">
                  <span className="text-primary mr-2">•</span>
                  {children}
                </li>
              ),
              strong: ({ children }) => {
                const text = String(children);
                return (
                  <strong className="font-semibold text-primary">{text.replace(/:$/, '')}</strong>
                );
              },
              a: ({ node, ...props }) => (
                <a
                  {...props}
                  onClick={(e) => {
                    e.preventDefault();
                    if (props.href) {
                      import("@tauri-apps/plugin-shell")
                        .then(({ open }) => open(props.href as string))
                        .catch(() => window.open(props.href as string, "_blank"));
                    }
                  }}
                  className="text-primary hover:underline cursor-pointer"
                />
              ),
              p: ({ children }) => (
                <p className="mb-3 text-center">{children}</p>
              ),
            }}
          >
            {changelog
              .replace(/^\*\*(.*?):?\*\*\s*$/gm, '### $1')
              .replace(/(?<!\]\()(https?:\/\/[^\s)]+)/g, '[$1]($1)')
            }
          </ReactMarkdown>
        </div>
        
        <div className="px-6 pt-5 pb-5 flex justify-center shrink-0">
          <button
            onClick={handleClose}
            className="px-8 py-2.5 cursor-pointer rounded-full bg-primary text-on-primary font-medium hover:brightness-110 transition-all"
          >
            Got it
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
