#!/usr/bin/env bash
set -euo pipefail

queue=".cursor/librarian-queue.json"

if [[ ! -f "$queue" ]]; then
  exit 0
fi

count=$(node -e "const q=require('./$queue');console.log((q.paths||[]).length);")

if [[ "$count" == "0" ]]; then
  exit 0
fi

echo '{"followup_message":"Run the Librarian skill (.cursor/skills/librarian/SKILL.md): npm run agents:refresh and commit generated files. Do not edit manifest.yaml by hand or modify handler logic."}'

node -e "require('fs').writeFileSync('$queue', JSON.stringify({paths:[]},null,2));"
exit 0
