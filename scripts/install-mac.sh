#!/bin/bash
# DeskHatch — macOS installer.
#
# Why this exists: the macOS builds are not notarized (that needs a paid Apple
# Developer account). macOS only runs its Gatekeeper/XProtect check on files
# carrying the `com.apple.quarantine` attribute, and that attribute is set by
# the *downloading app* — Safari, Chrome, Firefox. curl does not set it, so a
# release fetched by this script is never scanned, never blocked, and never
# moved to the Trash as "malware".
#
#   curl -fsSL https://raw.githubusercontent.com/kiwiman0706-beep/deskhatch/HEAD/scripts/install-mac.sh | bash
#
# Options:
#   --beta              install the newest prerelease instead of the newest stable
#   --version vX.Y.Z    install one specific release
#   --dest DIR          install somewhere other than /Applications

set -euo pipefail

REPO="kiwiman0706-beep/deskhatch"
APP_NAME="DeskHatch.app"
DEST="/Applications"
CHANNEL="stable"
VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --beta)    CHANNEL="beta"; shift ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    --dest)    DEST="${2:-}"; shift 2 ;;
    -h|--help)
      # Not read from $0: piped through `curl | bash` there is no script file.
      echo "install-mac.sh [--beta] [--version vX.Y.Z] [--dest DIR]"
      echo "  --beta            newest prerelease instead of the newest stable"
      echo "  --version vX.Y.Z  one specific release"
      echo "  --dest DIR        install target (default /Applications)"
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || { echo "This installer is for macOS only." >&2; exit 1; }

# --- find the release ---------------------------------------------------------
if [ -n "$VERSION" ]; then
  api="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
elif [ "$CHANNEL" = "beta" ]; then
  # /releases is newest-first and includes prereleases; /releases/latest skips them.
  api="https://api.github.com/repos/$REPO/releases?per_page=1"
else
  api="https://api.github.com/repos/$REPO/releases/latest"
fi

echo "==> Looking up the $CHANNEL release..."
json=$(curl -fsSL "$api")

# Pull out the first universal .zip download URL. The .zip is used rather than
# the .dmg so nothing has to be mounted, and so no Finder copy re-quarantines it.
url=$(printf '%s' "$json" \
  | grep -o '"browser_download_url": *"[^"]*-universal\.zip"' \
  | head -1 | sed 's/.*"\(https[^"]*\)"/\1/')
tag=$(printf '%s' "$json" | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

[ -n "$url" ] || { echo "No universal .zip found in that release." >&2; exit 1; }
echo "==> $tag"

# --- download + unpack --------------------------------------------------------
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "==> Downloading (about 190 MB)..."
curl -fL --progress-bar -o "$tmp/DeskHatch.zip" "$url"

echo "==> Unpacking..."
/usr/bin/ditto -x -k "$tmp/DeskHatch.zip" "$tmp/app"
[ -d "$tmp/app/$APP_NAME" ] || { echo "$APP_NAME missing from the archive." >&2; exit 1; }

# Releases built before the ad-hoc signing hook shipped carry no signature at
# all, which makes macOS call the bundle damaged. Signing locally costs nothing
# and is a no-op for builds that already carry one.
#
# codesign ships with the Xcode Command Line Tools, and on a Mac without them
# /usr/bin/codesign is a shim that pops the "install developer tools?" dialog —
# so check for the tools first rather than springing that on someone.
if /usr/bin/xcode-select -p >/dev/null 2>&1; then
  echo "==> Signing locally (ad-hoc)..."
  codesign --force --deep --sign - --timestamp=none "$tmp/app/$APP_NAME" 2>/dev/null \
    || echo "    (could not sign; continuing)"
else
  echo "==> Skipping local signing (Xcode Command Line Tools not installed)"
fi

# --- install ------------------------------------------------------------------
if [ ! -w "$DEST" ]; then
  echo "==> $DEST is not writable, installing to ~/Applications instead"
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

if [ -d "$DEST/$APP_NAME" ]; then
  echo "==> Replacing the existing copy in $DEST"
  # Quit a running instance first so the bundle isn't swapped underneath it.
  osascript -e 'tell application "DeskHatch" to quit' 2>/dev/null || true
  rm -rf "$DEST/$APP_NAME"
fi
/usr/bin/ditto "$tmp/app/$APP_NAME" "$DEST/$APP_NAME"

echo
echo "Installed $tag to $DEST/$APP_NAME"
echo "Open it with:  open '$DEST/$APP_NAME'"
