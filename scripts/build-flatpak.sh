#!/usr/bin/env bash
# Build MoonTranslator as a Flatpak from source (org.gnome.Sdk).
# Usage: scripts/build-flatpak.sh
set -euo pipefail

APP_ID="dev.noxygalaxy.moontranslator"
RUNTIME_VERSION="48"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$ROOT_DIR/dev.noxygalaxy.moontranslator.yml"
BUILD_DIR="$ROOT_DIR/build-flatpak"

command -v flatpak >/dev/null 2>&1 || { echo "error: flatpak is not installed (arch: sudo pacman -S flatpak)"; exit 1; }
command -v flatpak-builder >/dev/null 2>&1 || { echo "error: flatpak-builder is not installed (arch: sudo pacman -S flatpak-builder)"; exit 1; }

echo "==> Ensuring flathub remote"
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

echo "==> Installing runtimes (first run downloads a few GB)"
flatpak install --user --noninteractive flathub \
  "org.gnome.Platform//${RUNTIME_VERSION}" \
  "org.gnome.Sdk//${RUNTIME_VERSION}"

echo "==> Building ${APP_ID}"
flatpak-builder --user --install --ccache --install-deps-from=flathub --force-clean \
  --repo="$ROOT_DIR/flatpak-repo" \
  "$BUILD_DIR" \
  "$MANIFEST"

echo ""
echo "==> Done. Run with: flatpak run ${APP_ID}"
