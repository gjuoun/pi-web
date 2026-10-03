#!/usr/bin/env bash
# ui-pristine — keep components/ui (shadcn) native.
# Compares every components/ui/*.tsx with what the pinned shadcn CLI generates for it
# (`shadcn add <name> --view`, a read-only dry run: nothing is written into the app).
# A file may differ from upstream only if
#   1. it is named with --allow <file.tsx> (a primitive that carries a recorded variant), and
#   2. every changed hunk carries a `pi:` marker comment (so an upgrade knows what to re-apply).
# Output: `pristine: ok (N files)` or `drift: <file>(+a -r, m/h marked) ...`; exit 1 on any violation.
# Upgrade flow: bump shadcn in package.json, run this, re-apply the `pi:` hunks, re-run.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
ALLOW=""
while [ $# -gt 0 ]; do
  case "$1" in
    --allow) ALLOW+=" $2"; shift 2;;
    *) echo "usage: ui-pristine.sh [--allow <file.tsx>]..." >&2; exit 2;;
  esac
done
SHADCN=node_modules/.bin/shadcn
[ -x "$SHADCN" ] || { echo "ui-pristine: $SHADCN missing (npm ci)" >&2; exit 2; }
SCR=$(mktemp -d /tmp/ui-pristine.XXXX); trap 'rm -rf "$SCR"' EXIT

fetch() { # fetch <name> — upstream source of components/ui/<name>.tsx
  local name=$1
  # `--view <file>` prints just that file, boxed: content lines are prefixed `│ │ ` between
  # `│ ┌` and `│ └`. (Without the path it also prints every dependency component.)
  "$SHADCN" add "$name" --view "components/ui/$name.tsx" --cwd . --silent 2>/dev/null \
    | awk '/^│ ┌/ { body = 1; next } /^│ └/ { body = 0; next } body { sub(/^│ │ ?/, ""); print }' > "$SCR/$name.tsx" || true
}
export -f fetch; export SHADCN SCR

files=(components/ui/*.tsx)
printf '%s\n' "${files[@]}" | xargs -n1 -P6 -I{} bash -c 'n=$(basename {} .tsx); fetch "$n"'

out=""; bad=0
for f in "${files[@]}"; do
  b=$(basename "$f")
  if [ ! -s "$SCR/$b" ]; then out+=" $b(no-upstream)"; bad=1; continue; fi
  diff -q -B "$SCR/$b" "$f" >/dev/null && continue
  d=$(diff -B -U0 "$SCR/$b" "$f" || true)
  a=$(grep -c '^+[^+]' <<<"$d" || true); r=$(grep -c '^-[^-]' <<<"$d" || true)
  hunks=$(grep -c '^@@' <<<"$d" || true)
  marked=$(awk '/^@@/{if(h&&m)c++; h=1; m=0; next} h&&/^\+.*pi:/{m=1} END{if(h&&m)c++; print c+0}' <<<"$d")
  out+=" $b(+$a -$r, $marked/$hunks marked)"
  [[ " $ALLOW " == *" $b "* ]] || { bad=1; out+="[not allowed]"; }
  [ "$marked" -eq "$hunks" ] || bad=1
done
if [ -z "$out" ]; then echo "pristine: ok (${#files[@]} files)"; else echo "drift:$out"; fi
exit $bad
