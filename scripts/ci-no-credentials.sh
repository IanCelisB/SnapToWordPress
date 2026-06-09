#!/usr/bin/env bash
# Fails if credential-like strings appear in source code (WU-5 task 5.8).
set -euo pipefail

PATTERNS='ck_[a-f0-9]{20,}|cs_[a-f0-9]{20,}|WC_CONSUMER_KEY=|WC_CONSUMER_SECRET=|Basic [A-Za-z0-9+/=]{20,}'
DIRS="app/ src/"
HITS=0

for dir in $DIRS; do
  [ -d "$dir" ] || continue
  while IFS= read -r file; do
    if grep -qE "$PATTERNS" "$file" 2>/dev/null; then
      echo "CREDENTIAL LEAK: $file"
      grep -nE "$PATTERNS" "$file"
      HITS=1
    fi
  done < <(find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' \) ! -path '*__tests__*' ! -path '*.env*')
done

if [ "$HITS" -ne 0 ]; then
  echo "FATAL: credential-like strings found in source"
  exit 1
fi

echo "ci-no-credentials: clean"
