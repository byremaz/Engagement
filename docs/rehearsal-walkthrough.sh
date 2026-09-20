#!/usr/bin/env bash
# Headless rehearsal: drives one full session (20 simulated players) through
# all three games via the host REST API, checking the plan v2 invariants:
#  - race outcomes are persisted and scored (non-zero raw scores)
#  - a race closes early when every racer is done
#  - the per-game podium steps 1..4 and the ceremony 1..4
#  - rounds.csv carries Time/Base/Speed columns
# Usage: HOST_ACCESS_KEY=... BASE=http://localhost:3000/v1 bash docs/rehearsal-walkthrough.sh
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
act() { # act ACTION [json-fields]
  local body="{\"action\":\"$1\"${2:+,$2}}"
  local out; out=$(curl -s -m 20 "${H[@]}" -d "$body" "$BASE/sessions/$SID/actions")
  echo "  → $1 ${2:-}: $(echo "$out" | j "d.get('state','?')+' r'+str(d.get('roundNumber'))+' seq'+str(d.get('seq'))+(' ERR '+str(d.get('message')) if 'message' in d else '')")"
}
snap() { curl -s -m 20 "${H[@]}" "$BASE/sessions/$SID/snapshot"; }
wait_state() { # wait_state STATE MAX_SECONDS
  local t0=$SECONDS
  while true; do
    local st
    st=$(snap | j "d.get('state','?')")
    if [ "$st" = "$1" ]; then echo "  … $1 after $((SECONDS-t0)) s"; return 0; fi
    if [ $((SECONDS - t0)) -gt "$2" ]; then echo "  !! timeout waiting for $1 (now $st)"; return 1; fi
    sleep 2
  done
}
one_round() { # one scored round: START_ROUND → wait InputLocked → REVEAL_RESULTS
  act START_ROUND; wait_state InputLocked "$1" || true; act REVEAL_RESULTS
}
rounds() { # rounds COUNT MAX_SECONDS
  local n=$1 i
  for i in $(seq 1 "$n"); do
    one_round "$2"
    if [ "$i" -lt "$n" ]; then act NEXT_ROUND; fi
  done
}

SID=$(curl -s "${H[@]}" -d '{"title":"Rehearsal v2","capacity":100}' "$BASE/sessions" | j "d['id']")
echo "session $SID"
curl -s "${H[@]}" -d "{\"count\":$SIMS}" "$BASE/sessions/$SID/simulated-participants" >/dev/null
echo "added $SIMS simulated players"
# Bots react to signals; without AUTO the race would stay RED and nobody would move.
curl -s "${H[@]}" -X PATCH -d '{"mode":"AUTO"}' "$BASE/sessions/$SID/signal-mode" >/dev/null
curl -s "${H[@]}" -X PATCH -d '{"displayLang":"ar","defaultParticipantLang":"ar"}' "$BASE/sessions/$SID/languages" | j "'languages: display='+d['displayLang']+' default='+d['defaultParticipantLang']+' rules='+d['scoringRuleVersion']"

echo "== Game 1: Red Light, Green Light"
act SHOW_INSTRUCTIONS
act START_PRACTICE; wait_state InputLocked 40; act REVEAL_PRACTICE
act START_GAME
for r in 1 2 3; do
  echo " race $r"; t0=$SECONDS; one_round 100; echo "  race $r took $((SECONDS-t0)) s (deadline is 83 s: an early close proves the tick fix)"
  if [ "$r" -lt 3 ]; then act NEXT_ROUND; fi
done
act SHOW_GAME_RESULTS
for s in 1 2 3 4; do act PODIUM_STEP "\"step\":$s"; done
snap | j "'game standings top3: '+', '.join(f\"{r['name']} #{r['rank']} {r['total']}\" for r in d['standings'][:3])"

echo "== Game 2: Pin the Country"
act NEXT_GAME; act SHOW_INSTRUCTIONS; act START_PRACTICE; wait_state InputLocked 40; act REVEAL_PRACTICE; act START_GAME
rounds 8 40
act SHOW_GAME_RESULTS; for s in 1 2 3 4; do act PODIUM_STEP "\"step\":$s"; done

echo "== Game 3: Order It!"
act NEXT_GAME; act SHOW_INSTRUCTIONS; act START_PRACTICE; wait_state InputLocked 40; act REVEAL_PRACTICE; act START_GAME
rounds 10 35
act SHOW_GAME_RESULTS; for s in 1 2 3 4; do act PODIUM_STEP "\"step\":$s"; done

echo "== Final"
act SHOW_FINAL_RESULTS; for s in 1 2 3 4; do act CEREMONY_STEP "\"step\":$s"; done
snap | j "'final top3: '+', '.join(f\"{r['name']} #{r['rank']} {r['total']} ({r['rlgl']}/{r['geo']}/{r['order']})\" for r in d['standings'][:3])"

echo "== rounds.csv check"
curl -s "${H[@]}" "$BASE/sessions/$SID/exports/rounds.csv" | python -c "
import sys,csv,collections
rows=list(csv.DictReader(sys.stdin))
print('header:', list(rows[0].keys())[-6:])
g=collections.defaultdict(list)
for r in rows:
    if r['Practice']=='yes': continue
    g[(r['Game'],r['Round'])].append(float(r['Raw Score'] or 0))
for k in sorted(g): print(f'  {k[0]} round {k[1]:>2}: n={len(g[k])} max={max(g[k]):.1f} mean={sum(g[k])/len(g[k]):.1f}')
zero=[k for k,v in g.items() if max(v)==0]
print('rounds where everyone scored 0:', zero or 'none')
"
echo "done: session $SID"
