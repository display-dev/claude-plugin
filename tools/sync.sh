#!/usr/bin/env bash
# Copy the pinned display.dev and Visualize skills into skills/.
#
# display.dev is maintained in github.com/display-dev/skill and Visualize in
# github.com/display-dev/visualize. This plugin bundles one pinned commit of
# each (sources.lock). Never edit skills/ by hand.
#
# Visualize is trimmed so the plugin stays small enough for directory
# validation: its design-system packages (except _template and clean) and its
# test files are left out, design-systems/REMOTE.md points at the full catalog
# at the same commit, and this copy's SKILL.md gets one paragraph telling the
# agent to fetch a missing package from there. The upstream skill is unchanged.
#
# Usage:
#   tools/sync.sh           # replace skills/ with the pinned sources
#   tools/sync.sh --check   # exit non-zero when skills/ has drifted

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCK="$ROOT/sources.lock"

MODE="sync"
case "${1:-}" in
  "") ;;
  --check) MODE="check" ;;
  *) echo "usage: tools/sync.sh [--check]" >&2; exit 2 ;;
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

# Leave out what the plugin does not need at run time and record where the
# full design-system catalog lives.
# $1 = copy to trim, $2 = repo URL, $3 = pinned ref, $4 = path in the repo
trim_visualize() {
  local dir="$1" repo="$2" ref="$3" path="$4" slug base
  for slug in "$dir"/design-systems/*/; do
    case "$(basename "$slug")" in
      _template|clean) ;;
      *) rm -rf "$slug" ;;
    esac
  done
  rm -rf "$dir/fixtures" "$dir/scripts/fixtures"
  rm -f "$dir"/scripts/*.test.mjs "$dir/scripts/image-test-fixtures.mjs" "$dir/scripts/pattern-fixture-smoke.mjs"
  base="${repo%.git}"
  base="${base/https:\/\/github.com\//https://raw.githubusercontent.com/}"
  cat > "$dir/design-systems/REMOTE.md" <<REMOTE
# Remote design-system catalog

This copy of Visualize bundles \`catalog-index.json\`, \`_template/\`, and \`clean/\`.
Every other design system listed in \`catalog-index.json\` is at:

$base/$ref/$path/design-systems/

Append \`<slug>/README.md\`, \`<slug>/DESIGN.md\`, or \`<slug>/tokens.css\`.
REMOTE
  add_remote_rule "$dir/SKILL.md"
}

# Insert the fetch rule after the paragraph that introduces design-systems/.
# Fails when upstream moves that paragraph, so the rule is never lost silently.
add_remote_rule() {
  local skill="$1" anchor rule
  anchor='The design systems under `design-systems/` are reference packages'
  rule='This copy of Visualize bundles only `catalog-index.json`, `_template/`, and `clean/` from `design-systems/`. `design-systems/REMOTE.md` holds the base URL of the full catalog at the same version. When a selected package folder is missing, fetch its `README.md`, `DESIGN.md`, and `tokens.css` from that base URL plus `<slug>/<file>` with `curl` or the host'"'"'s web fetch, then use them as if they were local. If a fetch fails, name the package that could not be loaded and continue with the next shortlisted reference or the fallback; never rebuild a package from memory.'
  if [[ "$(grep -cF "$anchor" "$skill")" != "1" ]]; then
    echo "sync: $skill must contain exactly one line starting the design-systems paragraph" >&2
    exit 1
  fi
  RULE="$rule" ANCHOR="$anchor" awk '
    { print }
    index($0, ENVIRON["ANCHOR"]) == 1 { print ""; print ENVIRON["RULE"] }
  ' "$skill" > "$skill.tmp"
  mv "$skill.tmp" "$skill"
}

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
  if [[ "$name" == "visualize" ]]; then
    trim_visualize "$src" "$repo" "$ref" "$path"
  fi

  if [[ "$MODE" == "check" ]]; then
    if diff -r "$src" "$dest" >/dev/null 2>&1; then
      echo "sync: skills/$name matches $ref"
    else
      echo "sync: skills/$name does not match $ref. Run tools/sync.sh and commit the result." >&2
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
sync_one visualize
exit "$STATUS"
