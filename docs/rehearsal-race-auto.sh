#!/usr/bin/env bash
# Race-only rehearsal in AUTO signal mode: proves that outcomes persist for
# every race, that the v2 finisher/speed scoring produces non-zero results and
# that a race closes early once every bot is finished or out.
# Usage: HOST_ACCESS_KEY=... bash docs/rehearsal-race-auto.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000/v1}"
KEY="${HOST_ACCESS_KEY:?set HOST_ACCESS_KEY}"
H=(-H "x-host-key: $KEY" -H 'content-type: application/json')
SIMS="${SIMS:-20}"
j() { python -c "import sys,json
raw=sys.stdin.read().strip()
try: d=json.loads(raw) if raw else {}
except Exception: d={'message': 'non-json: '+raw[:80]}
try: print($1)
except Exception as e: print('?? '+str(e))"; }
act() { local out; out=$(curl -s -m 30 "${H[@]}" -d "{\"action\":\"$1\"${2:+,$2}}" "$BASE/sessions/$SID/actions"); echo "  → $1: $(echo "$out" | j "d.get('state','?')+' r'+str(d.get('roundNumber'))+(' ERR '+str(d.get('message')) if 'message' in d else '')")"; }
snap() { curl -s -m 30 "${H[@]}" "$BASE/sessions/$SID/snapshot" || echo '{}'; }
wait_state() {
  local t0=$SECONDS st
  while true; do
    st=$(snap | j "d.get('state','?')")
    if [ "$st" = "$1" ]; then echo "  … $1 after $((SECONDS-t0)) s"; return 0; fi
    if [ $((SECONDS-t0)) -gt "$2" ]; then echo "  !! timeout ($st)"; return 1; fi
    sleep 2
  done
}

SID=$(curl -s "${H[@]}" -d '{"title":"Race AUTO rehearsal","capacity":100}' "$BASE/sessions" | j "d['id']")
curl -s "${H[@]}" -d "{\"count\":$SIMS}" "$BASE/sessions/$SID/simulated-participants" >/dev/null
curl -s "${H[@]}" -X PATCH -d '{"mode":"AUTO"}' "$BASE/sessions/$SID/signal-mode" >/dev/null
echo "session $SID · $SIMS bots · AUTO signals"
act SHOW_INSTRUCTIONS; act START_PRACTICE; wait_state InputLocked 40 || true; act REVEAL_PRACTICE; act START_GAME
for r in 1 2 3; do
  t0=$SECONDS; act START_ROUND; wait_state InputLocked 100 || true
  snap | j "'  race $r live counts: alive='+str(sum(p['state']=='alive' for p in d['race']['players']))+' finished='+str(sum(p['state']=='finished' for p in d['race']['players']))+' out='+str(sum(p['state']=='eliminated' for p in d['race']['players']))"
  act REVEAL_RESULTS; echo "  race $r wall time $((SECONDS-t0)) s (deadline 83 s)"
  snap | j "'  reveal top3: '+', '.join(f\"{x['name']} {x['state']} raw={x['raw']} base={x.get('base')} speed={x.get('speed')} t={x.get('timeMs')}\" for x in d['reveal']['results'][:3])"
  if [ "$r" -lt 3 ]; then act NEXT_ROUND; fi
done
act SHOW_GAME_RESULTS; for s in 1 2 3 4; do act PODIUM_STEP "\"step\":$s"; done
snap | j "'  game top3: '+', '.join(f\"{r['name']} #{r['rank']} {r['rlgl']}\" for r in d['standings'][:3])"
curl -s "${H[@]}" "$BASE/sessions/$SID/exports/rounds.csv" | python -c "
import sys,csv,collections
rows=[r for r in csv.DictReader(sys.stdin) if r['Practice']=='no']
g=collections.defaultdict(list)
for r in rows: g[r['Round']].append(r)
for k in sorted(g):
    raws=[float(r['Raw Score'] or 0) for r in g[k]]
    print(f'  rounds.csv race {k}: rows={len(g[k])} max={max(raws):.1f} mean={sum(raws)/len(raws):.1f} sample detail={g[k][0][\"Detail\"]!r} time={g[k][0][\"Time (ms)\"]!r} rule={g[k][0][\"Rule Version\"]}')
"
echo "done $SID"
