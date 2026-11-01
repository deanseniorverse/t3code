#!/bin/bash
# Fork-only: builds this checkout and installs it as T3 Code (Deno).
#
#   scripts/update-deno-app.sh              build, then install
#   scripts/update-deno-app.sh --no-build   install the newest DMG in release/
#   scripts/update-deno-app.sh --rollback   swap back to the previous install
#   scripts/update-deno-app.sh --status     show what is installed
#   scripts/update-deno-app.sh --restart    quit and reopen the app
#
# Safe to run from inside T3 Code: the install runs detached, so it finishes after the app quits.
set -euo pipefail

APP_NAME="T3 Code (Deno)"
BUNDLE_ID="com.t3tools.t3code.deno"
INSTALL_DIR="${T3_DENO_INSTALL_DIR:-/Applications}"
APP_PATH="$INSTALL_DIR/$APP_NAME.app"
STATE_DIR="${T3_DENO_STATE_DIR:-$HOME/Library/Caches/t3code-deno}"
STAGED="$STATE_DIR/staged.app"
PREVIOUS="$STATE_DIR/previous.app"
LOG="$STATE_DIR/update.log"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SELF="$REPO/scripts/update-deno-app.sh"

die() {
  echo "error: $*" >&2
  exit 1
}

bundle_id() {
  plutil -extract CFBundleIdentifier raw "$1/Contents/Info.plist" 2>/dev/null || true
}

app_version() {
  plutil -extract CFBundleShortVersionString raw "$1/Contents/Info.plist" 2>/dev/null || echo "?"
}

is_running() {
  # Not pgrep: pgrep -x does not find this app's name on macOS.
  [ -z "${T3_DENO_INSTALL_DIR:-}" ] && ps -axo comm= | grep -xF "/Applications/$1.app/Contents/MacOS/$1" >/dev/null
}

show_status() {
  if [ -d "$APP_PATH" ]; then
    echo "installed: $APP_PATH, version $(app_version "$APP_PATH"), $(stat -f '%Sm' "$APP_PATH/Contents/Info.plist")"
  else
    echo "installed: none"
  fi
  if [ -d "$PREVIOUS" ]; then
    echo "rollback:  version $(app_version "$PREVIOUS"), $(stat -f '%Sm' "$PREVIOUS/Contents/Info.plist")"
  else
    echo "rollback:  none"
  fi
  if is_running "$APP_NAME"; then echo "running:   yes"; else echo "running:   no"; fi
  [ -f "$LOG" ] && echo "last log:  $LOG"
  return 0
}

build() {
  export PATH="$HOME/.cargo/bin:$HOME/.local/share/vite-plus/bin:$PATH"
  command -v vp >/dev/null || die "vp is not installed"
  cd "$REPO"
  [ -z "$(git status --porcelain)" ] || echo "note: building uncommitted changes too"
  echo "building $(git rev-parse --abbrev-ref HEAD) at $(git rev-parse --short HEAD), about 10 minutes..."
  vp i
  env -u GITHUB_REPOSITORY -u T3CODE_DESKTOP_UPDATE_REPOSITORY vp run dist:desktop:dmg:arm64
}

newest_dmg() {
  local dmg
  dmg="$(ls -t "$REPO"/release/*-arm64.dmg 2>/dev/null | head -1 || true)"
  [ -n "$dmg" ] || die "no DMG in release/; run without --no-build"
  echo "$dmg"
}

# Everything that can fail on a bad DMG happens here, before the app is closed.
stage_dmg() {
  local dmg="$1" mount
  mount="$(mktemp -d /tmp/t3-deno-dmg.XXXXXX)"
  hdiutil attach -nobrowse -readonly -mountpoint "$mount" "$dmg" >/dev/null
  rm -rf "$STAGED"
  local copied=0
  ditto "$mount/$APP_NAME.app" "$STAGED" && copied=1
  hdiutil detach "$mount" >/dev/null || true
  rmdir "$mount" 2>/dev/null || true
  [ "$copied" = 1 ] || die "could not copy $APP_NAME.app out of $dmg"
  [ "$(bundle_id "$STAGED")" = "$BUNDLE_ID" ] || die "$dmg is not $APP_NAME"
}

quit_app() {
  is_running "$APP_NAME" || return 0
  echo "quitting $APP_NAME..."
  osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
  local waited=0
  while is_running "$APP_NAME"; do
    [ "$waited" -lt 60 ] || return 1
    sleep 1
    waited=$((waited + 1))
  done
}

# Runs detached. Swaps the staged app in and restores the old one if the copy fails.
install_staged() {
  if ! quit_app; then
    echo "FAILED: $APP_NAME did not quit within 60 seconds; nothing changed"
    return 1
  fi
  sleep 1
  rm -rf "$PREVIOUS"
  [ ! -d "$APP_PATH" ] || mv "$APP_PATH" "$PREVIOUS"
  if ! mv "$STAGED" "$APP_PATH"; then
    [ ! -d "$PREVIOUS" ] || mv "$PREVIOUS" "$APP_PATH"
    echo "FAILED: could not install; kept the old app"
    [ -n "${T3_DENO_INSTALL_DIR:-}" ] || open "$APP_PATH" || true
    return 1
  fi
  echo "installed version $(app_version "$APP_PATH")"
  [ -z "${T3_DENO_INSTALL_DIR:-}" ] || {
    echo "DONE"
    return 0
  }
  # Both apps share one T3 home, so only one may run at a time.
  if is_running "T3 Code (Beta)"; then
    echo "T3 Code (Beta) is running, so $APP_NAME was not opened"
  else
    open "$APP_PATH"
  fi
  osascript -e "display notification \"Version $(app_version "$APP_PATH") installed\" with title \"$APP_NAME\"" >/dev/null 2>&1 || true
  echo "DONE"
}

restart_app() {
  if ! quit_app; then
    echo "FAILED: $APP_NAME did not quit within 60 seconds"
    return 1
  fi
  sleep 1
  open "$APP_PATH"
  echo "DONE"
}

# Double fork: the work leaves the app's process tree, so quitting the app cannot stop it.
run_detached() {
  : >"$LOG"
  perl -MPOSIX -e 'exit 0 if fork; POSIX::setsid(); exit 0 if fork; exec @ARGV' \
    /bin/bash "$SELF" "$1" >>"$LOG" 2>&1 </dev/null
  echo "working; if this terminal closes, the log is $LOG"
  until grep -qE '^(DONE|FAILED)' "$LOG"; do sleep 1; done
  cat "$LOG"
  ! grep -q '^FAILED' "$LOG"
}

mkdir -p "$STATE_DIR"

case "${1:-}" in
  "")
    build
    stage_dmg "$(newest_dmg)"
    run_detached --install-staged
    ;;
  --no-build)
    dmg="$(newest_dmg)"
    echo "using $dmg"
    stage_dmg "$dmg"
    run_detached --install-staged
    ;;
  --rollback)
    [ -d "$PREVIOUS" ] || die "no previous install to roll back to"
    rm -rf "$STAGED"
    mv "$PREVIOUS" "$STAGED"
    run_detached --install-staged
    ;;
  --status)
    show_status
    ;;
  --restart)
    run_detached --restart-detached
    ;;
  --restart-detached)
    trap '[ $? = 0 ] || echo "FAILED: restart stopped early; see the lines above"' EXIT
    restart_app
    ;;
  --install-staged)
    # The foreground waits for a DONE or FAILED line, so an unexpected exit must still print one.
    trap '[ $? = 0 ] || echo "FAILED: install stopped early; see the lines above"' EXIT
    install_staged
    ;;
  *)
    sed -n '2,9p' "$SELF" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
