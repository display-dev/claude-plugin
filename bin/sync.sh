#!/usr/bin/env bash
# Copy the pinned display.dev skill into skills/.
#
# The skill is maintained in github.com/display-dev/skill. This plugin bundles
# one pinned commit or tag of it (sources.lock). Never edit skills/ by hand.
#
# Usage:
#   bin/sync.sh           # replace skills/ with the pinned sources
#   bin/sync.sh --check   # exit non-zero when skills/ has drifted

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/sources.lock"

MODE="sync"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  *) echo "usage: bin/sync.sh [--check]" >&2; exit 2 ;;
esac

read_lock() {
  local value
  value="$(grep -E "^$1=" "$LOCK" | head -n 1 | cut -d= -f2-)"
  if [[ -z "$value" ]]; then
    echo "sync: $LOCK must set $1=" >&2
    exit 1
  fi
  printf '%s' "$value"
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
STATUS=0

# $1 = name in sources.lock and folder under skills/
sync_one() {
  local name="$1" repo ref path src dest
  repo="$(read_lock "${name}_repo")"
  ref="$(read_lock "${name}_ref")"
  path="$(read_lock "${name}_path")"
  git init -q "$WORK/$name"
  git -C "$WORK/$name" fetch -q --depth 1 "$repo" "$ref"
  git -C "$WORK/$name" -c advice.detachedHead=false checkout -q FETCH_HEAD
  src="$WORK/$name/$path"
  dest="$ROOT/skills/$name"
  if [[ ! -f "$src/SKILL.md" ]]; then
    echo "sync: $repo@$ref has no $path/SKILL.md" >&2
    exit 1
  fi

  if [[ "$MODE" == "check" ]]; then
    if diff -r "$src" "$dest" >/dev/null 2>&1; then
      echo "sync: skills/$name matches $ref"
    else
      echo "sync: skills/$name does not match $ref. Run bin/sync.sh and commit the result." >&2
      STATUS=1
    fi
    return
  fi

  rm -rf "$dest"
  mkdir -p "$ROOT/skills"
  cp -R "$src" "$dest"
  echo "sync: copied $path at $ref to skills/$name"
}

sync_one display-dev
exit "$STATUS"
