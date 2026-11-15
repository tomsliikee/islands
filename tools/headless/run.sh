#!/usr/bin/env bash
# Runs Islands in a GNOME Shell without a screen, with its own settings,
# and lets a script drive it and take screenshots. From Halo's rig.
#
#   tools/headless/run.sh <script> [seconds]
#
# <script> is a file in tools/headless/scripts, without ".js". Screenshots
# and the log go to $ISLANDS_OUT (default: a folder in the system's temp).
#
#   ISLANDS_WITH="<uuid>[=<path to its extension folder>] ..."
#       loads other extensions first; without a path the installed copy
#       (~/.local/share or /usr/share) is used.
#   ISLANDS_MONITORS=2   two virtual monitors instead of one.
#   ISLANDS_SCHEME=light|dark   the desktop's colour scheme (default dark).
#   ISLANDS_WITHOUT=1    the driver alone, to compare costs.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export ISLANDS_OUT="${ISLANDS_OUT:-${TMPDIR:-/tmp}/islands-headless}"
ENV="$ISLANDS_OUT/env"
EXTENSIONS="$ENV/data/gnome-shell/extensions"

glib-compile-schemas "$REPO/extension/schemas"
# Each run starts clean: settings, caches, state, the stand-in apps' files.
rm -rf "$ENV/config/dconf" "$ENV/cache" "$ENV/state" "$ENV/downloads" "$ENV/data/Nectarlink"
mkdir -p "$EXTENSIONS" "$ENV/config" "$ENV/cache" "$ISLANDS_OUT/shots"
rm -f "$ISLANDS_OUT/shots/"*.png "$ISLANDS_OUT/log.txt"
ln -sfn "$REPO/extension" "$EXTENSIONS/islands@thomashaiden"
ln -sfn "$HERE/driver" "$EXTENSIONS/islands-driver@test"
EXTRA=""
for pair in ${ISLANDS_WITH:-}; do
    uuid="${pair%%=*}"
    path="${pair#*=}"
    if [ "$path" = "$pair" ]; then
        path="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
        [ -d "$path" ] || path="/usr/share/gnome-shell/extensions/$uuid"
    fi
    ln -sfn "$path" "$EXTENSIONS/$uuid"
    EXTRA+="\"$uuid\", "
done
export EXTRA
# Downloads in the scratch folder, never the real one; the folders of the
# stand-in apps exist, as they do where the apps are installed.
mkdir -p "$ENV/downloads" "$ENV/data/Nectarlink" "$ENV/cache/tally"
printf 'XDG_DOWNLOAD_DIR="%s"\n' "$ENV/downloads" > "$ENV/config/user-dirs.dirs"
# The scratch data folder has no fonts of its own.
ln -sfn "${XDG_DATA_HOME:-$HOME/.local/share}/fonts" "$ENV/data/fonts"

MONITORS="--virtual-monitor 1280x800"
if [ "${ISLANDS_MONITORS:-1}" = "2" ]; then
    MONITORS="--virtual-monitor 1280x800 --virtual-monitor 1024x768"
fi
export MONITORS
ENABLED="[$EXTRA\"islands@thomashaiden\", \"islands-driver@test\"]"
if [ "${ISLANDS_WITHOUT:-}" = 1 ]; then ENABLED="[$EXTRA\"islands-driver@test\"]"; fi
export ENABLED
export ISLANDS_SCHEME="${ISLANDS_SCHEME:-dark}"
export ISLANDS_SCRIPT="$HERE/scripts/$1.js"
export ISLANDS_SECONDS="${2:-60}"
export XDG_CONFIG_HOME="$ENV/config" XDG_CACHE_HOME="$ENV/cache" XDG_DATA_HOME="$ENV/data" XDG_STATE_HOME="$ENV/state"
export G_MESSAGES_DEBUG=Gjs-Console
unset WAYLAND_DISPLAY DISPLAY

exec dbus-run-session -- bash -c '
gsettings set org.gnome.shell enabled-extensions "$ENABLED"
gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.shell welcome-dialog-last-shown-version "99"
gsettings set org.gnome.desktop.interface color-scheme "$( [ "$ISLANDS_SCHEME" = dark ] && echo prefer-dark || echo default )"
gsettings set org.gnome.desktop.interface enable-hot-corners false
gsettings set org.gnome.mutter dynamic-workspaces false
gsettings set org.gnome.desktop.background picture-options none
gsettings set org.gnome.desktop.background color-shading-type solid
gsettings set org.gnome.desktop.background primary-color "#3a4a6b"
timeout -k 10 "$ISLANDS_SECONDS" gnome-shell --headless $MONITORS --wayland-display islands-test --no-x11 2>&1'
