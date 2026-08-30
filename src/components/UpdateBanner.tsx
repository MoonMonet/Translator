"use client";

import { useState, useEffect } from "react";
import { X, Download, FileText } from "lucide-react";
import { APP_VERSION, isNewerVersion } from "@/lib/version";
import { getPlatform } from "@/lib/platform";
import { loadCache } from "@/lib/settingsCache";

interface UpdateBannerProps {
  onViewChangelog?: () => void;
}

export default function UpdateBanner({ onViewChangelog }: UpdateBannerProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [noUpdateAvailable, setNoUpdateAvailable] = useState(false);

  useEffect(() => {
    checkForUpdates();

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.listen("check-update", () => {
          checkForUpdates(true); // Pass true to show banner when manually checking
        });
      } catch {}
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const checkForUpdates = async (showBanner = false) => {
    try {
      const { fetch } = await import("@tauri-apps/plugin-http");
      const response = await fetch(
        "https://api.github.com/repos/noxygalaxy/MoonTranslator/releases/latest",
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "MoonTranslator",
          },
        }
      );

      if (response.ok) {
        const release = await response.json();
        const latestVersion = release.tag_name?.replace("v", "") || "";

        console.log("Current version:", APP_VERSION);
        console.log("Latest version:", latestVersion);

        if (latestVersion && isNewerVersion(latestVersion, APP_VERSION)) {
          // Find the platform-appropriate update asset
          const isLinux = getPlatform() === "linux";
          const portableAsset = release.assets?.find((asset: any) =>
            isLinux ? asset.name.endsWith(".AppImage") : asset.name.includes("portable.zip")
          );

          if (portableAsset) {
            setNewVersion(latestVersion);
            setDownloadUrl(portableAsset.browser_download_url);
            setUpdateAvailable(true);
            setNoUpdateAvailable(false);
            console.log("Update available!");
          }
        } else {
          console.log("No update available");
          setUpdateAvailable(false);
          // Only show "latest version" banner if manually checking
          if (showBanner) {
            setNoUpdateAvailable(true);
            // Auto-hide after 3 seconds
            setTimeout(() => setNoUpdateAvailable(false), 3000);
          }
        }
      }

      const store = await loadCache();
      await store.set("lastUpdateCheck", Date.now());
      await store.save();
    } catch (error) {
      console.error("Update check failed:", error);
    }
  };

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("download_and_install_update", {
        version: newVersion,
        downloadUrl: downloadUrl,
      });
    } catch (e) {
      console.error("Update failed:", e);
      setUpdating(false);
    }
  };

  if (updateAvailable && !dismissed) {
    return (
      <div
        className="toast-enter flex items-center justify-between gap-3 px-5 py-3 shrink-0 rounded-(--md-shape-md) bg-surface-high"
      >
        <div className="flex items-center gap-3 text-sm">
          <Download size={16} />
          <span>
            Update available:{" "}
            <span className="font-semibold">v{newVersion}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpdate}
            disabled={updating}
            className="text-sm cursor-pointer font-medium px-4 py-1.5 rounded-full transition-opacity disabled:opacity-50 bg-(--md-inverse-primary) text-(--md-inverse-on-primary)"
          >
            {updating ? "Installing..." : "Install"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="md-icon-btn w-8 h-8 text-inverse-on-surface"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  if (noUpdateAvailable) {
    return (
      <div
        className="toast-enter flex items-center justify-between gap-3 px-5 py-3 shrink-0 rounded-(--md-shape-md) bg-surface-high"
      >
        <div className="flex items-center gap-3 text-sm">
          <FileText size={16} />
          <span>You're on the latest version!</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onViewChangelog}
            className="text-sm cursor-pointer font-medium px-4 py-1.5 rounded-full bg-(--md-inverse-primary) text-(--md-inverse-on-primary)"
          >
            View Changelog
          </button>
          <button
            onClick={() => setNoUpdateAvailable(false)}
            className="md-icon-btn w-8 h-8 text-inverse-on-surface"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
