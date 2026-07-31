#!/usr/bin/env bash
# Run this once locally to push the rewritten history (with the leaked
# Firebase API key removed) to GitHub.
#
# The Puku CLI sandbox blocks destructive force-pushes, so this script
# must be run by the user from a regular terminal.
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Local history (ready to push) ==="
git log --oneline

echo
echo "=== Remote main (still has leaked key) ==="
git ls-remote origin main

echo
echo "=== Force-pushing rewritten history to origin/main ==="
git push --force-with-lease origin main

echo
echo "=== Done. Verify on GitHub: ==="
echo "    https://github.com/Musfique-Ahmed/NoteHub"
echo
echo "If GitHub still shows the secret alert, dismiss it manually at:"
echo "    Settings → Code security and analysis → Secret scanning → Alerts"
