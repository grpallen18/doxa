#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.file_path||j.path||'');}catch{console.log('');}})")

if [[ -z "$file_path" ]]; then
  exit 0
fi

normalized=$(echo "$file_path" | tr '\\' '/')

case "$normalized" in
  *doxa-agents/docs/generated/*) exit 0 ;;
  doxa-agents/*|supabase/functions/*|supabase/migrations/*|workers/*)
    queue=".cursor/librarian-queue.json"
    mkdir -p .cursor
    node -e "
const fs=require('fs');
const q=fs.existsSync('$queue')?JSON.parse(fs.readFileSync('$queue','utf8')):{paths:[]};
const p='$normalized';
if(!q.paths.includes(p)) q.paths.push(p);
fs.writeFileSync('$queue', JSON.stringify(q,null,2));
"
    ;;
esac

exit 0
