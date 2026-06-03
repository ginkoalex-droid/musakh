#!/bin/bash
# Daily auto-commit and push for Dr-Cycle garage system
# Runs at 21:00 Israel time via crontab

set -e

REPO="/Users/ginko/Сервис"
LOG="/Users/ginko/Сервис/scripts/daily_commit.log"

cd "$REPO"

# Only commit if there are changes
if git diff --quiet && git diff --staged --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "$(date '+%Y-%m-%d %H:%M') — no changes, skipping" >> "$LOG"
  exit 0
fi

TODAY=$(date '+%d.%m.%Y')
MSG="chore: daily auto-commit $TODAY"

git add -A
git commit -m "$MSG"
git push origin develop

echo "$(date '+%Y-%m-%d %H:%M') — committed and pushed: $MSG" >> "$LOG"
