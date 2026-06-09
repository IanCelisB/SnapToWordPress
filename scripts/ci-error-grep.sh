#!/usr/bin/env bash
# CI guard: fail the build if any app screen or src module leaks forbidden
# patterns that the design spec requires NEVER reach a user-facing string.
#
# See: design §12 (testing strategy) + error-presentation spec R1, R5.
#
# This script is intentionally written in pure POSIX bash so it works on the
# GitHub Actions macOS/linux runner, the user's local macOS/Linux, and the
# Windows-bash environments Expo's CI tooling supports. It does NOT depend on
# ripgrep — `grep -E` is enough.

set -u
set -o pipefail

# Patterns that MUST NOT appear in app/ or src/.
# - \b\d{3}\b   → HTTP status codes (401, 404, 500, etc.)
# - HTTP        → English word, jargon
# - JSON        → English word, jargon
# - fetch failed→ React Native raw network error
# - TypeError   → JS exception class leaking
# - undefined is not → JS runtime error leaking
# - optifull.cl → the user's current store domain; the repo is for any store.
PATTERNS='\b[0-9]{3}\b|HTTP|JSON|fetch failed|TypeError|undefined is not|optifull\.cl'

# Directories to scan. `app/` is Expo Router (where screens live); `src/` is
# domain code. Test directories and generated directories are excluded.
ROOTS=("app" "src")

fail=0
for root in "${ROOTS[@]}"; do
  if [[ ! -d "$root" ]]; then
    continue
  fi
  # Find candidate files (.ts, .tsx, .js, .jsx), excluding test dirs, node_modules,
  # build output, and assets. The `*/$d` glob matches the dir at any depth.
  while IFS= read -r -d '' file; do
    case "$file" in
      */__tests__/*|*/node_modules/*|*/.expo/*|*/dist/*|*/coverage/*|*/assets/*|*/error-presentation/*)
        # `error-presentation/` is the catalog itself + the classifier.
        # The catalog documents the forbidden tokens in its own header
        # comment, and the classifier literally matches HTTP status codes
        # (401, 403, 429, 5xx). Both are correct usages and must not be
        # treated as leaks. The grep is meant to catch tokens in screens
        # and components, not in the defense layer.
        continue
        ;;
    esac
    if grep -EHn -- "$PATTERNS" "$file" >/dev/null 2>&1; then
      echo "ci-error-grep: forbidden pattern in $file:" >&2
      grep -EHn -- "$PATTERNS" "$file" >&2
      fail=1
    fi
  done < <(find "$root" -type f \
            \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) \
            -print0)
done

if [[ "$fail" -ne 0 ]]; then
  echo "" >&2
  echo "ci-error-grep: build FAILED." >&2
  echo "  Forbidden patterns reached user-facing files." >&2
  echo "  Route them through src/error-presentation (see design §10)." >&2
  exit 1
fi

echo "ci-error-grep: OK — no forbidden patterns in app/ or src/."
exit 0
