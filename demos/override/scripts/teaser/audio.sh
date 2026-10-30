#!/usr/bin/env bash
# Teaser audio: ElevenLabs music bed + SFX (cached in cache/), local synth for anything missing,
# then an ffmpeg mix on the storyboard beats. ./audio.sh --synth skips ElevenLabs.
# The API key is read from the kluky project and only ever reaches curl through stdin.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cache
API=https://api.elevenlabs.io/v1

key_from() { grep -E '^ELEVENLABS_API_KEY=' "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d "\"' \r"; }
KEYS=("$(key_from ~/Developer/kluky/kluky-setup/.env)" "$(key_from ~/Developer/kluky/.kluky-pilot/profile/.env)")

# post <endpoint> <json> <out.mp3>: tries each key; prints the HTTP status, keeps the file only on 200.
post() {
  local code=000
  for k in "${KEYS[@]}"; do
    [ -n "$k" ] || continue
    code=$(printf 'header = "xi-api-key: %s"\n' "$k" | curl -s --config - -X POST "$API/$1?output_format=mp3_44100_128" \
      -H 'Content-Type: application/json' -d "$2" -o "$3.part" -w '%{http_code}')
    [ "$code" = 200 ] && { mv "$3.part" "$3"; break; }
  done
  [ "$code" = 200 ] || { echo "  $1 -> HTTP $code: $(head -c 300 "$3.part" 2>/dev/null)" >&2; rm -f "$3.part"; }
  echo "$code"
}

sfx() { # sfx <name> <seconds> <prompt>
  [ -s "cache/$1.mp3" ] && { echo "cached $1"; return; }
  echo "sfx $1: $(post sound-generation "$(printf '{"text":"%s","duration_seconds":%s,"prompt_influence":0.6}' "$3" "$2")" "cache/$1.mp3")"
}

if [ "${1:-}" != --synth ]; then
  if [ ! -s cache/music.mp3 ]; then
    MUSIC_PROMPT='Playful pixel-art detective game teaser. Pizzicato strings, marimba and light percussion, mischievous mystery mood, 112 bpm. A short suspense stop at 5 seconds, then a bright resolving final hit at 7.5 seconds that rings out. Instrumental, no vocals.'
    code=$(post music "$(printf '{"prompt":"%s","music_length_ms":10000,"force_instrumental":true}' "$MUSIC_PROMPT")" cache/music.mp3)
    echo "music: $code"
    if [ "$code" != 200 ]; then
      echo "music API unavailable, falling back to a sound-generation bed"
      sfx music 10 'Playful pizzicato strings and marimba mystery jingle, pixel game detective music, light percussion, instrumental, ends on a bright final chord'
    fi
  else echo "cached music"; fi

  sfx pop 0.5 'Soft cute cartoon bubble pop, small UI blip, pixel game'
  sfx glitch 1 'Short digital glitch stutter followed by a quick vinyl record scratch, comedic suspense hit'
  sfx final 2 'Warm resolving hand bell chime with a soft magical whoosh, game title reveal'
fi

# Anything ElevenLabs could not make comes from the local synth (cache/*.wav).
python3 -I synth.py
clip() { [ -s "cache/$1.mp3" ] && echo "cache/$1.mp3" || echo "cache/$1.wav"; }

# "clip at_ms gain_db", timed to stage.html: a pop for "Three agents,", the glitch on "misaligned", a pop for "Can you find him?",
# a pop for each bubble, the whoosh into the end card, the line-up pops, the bell on ARBITER.
EVENTS=(
  "pop 100 -5" "glitch 950 0" "pop 1500 -6"
  "pop 2560 -3" "pop 4060 -3" "pop 5560 -3"
  "whoosh 6500 -4"
  "pop 7200 -10" "pop 7320 -10" "pop 7440 -10"
  "final 8100 0"
)
inputs=(-i "$(clip music)")
graph="[0]atrim=0:10,volume=-6dB[a0];"
labels="[a0]"
i=1
for event in "${EVENTS[@]}"; do
  read -r name at gain <<< "$event"
  inputs+=(-i "$(clip "$name")")
  graph+="[$i]adelay=$at:all=1,volume=${gain}dB[a$i];"
  labels+="[a$i]"
  i=$((i + 1))
done
graph+="${labels}amix=inputs=$i:normalize=0,apad,atrim=0:10,afade=t=out:st=9.6:d=0.4"
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$graph" -ac 2 -ar 48000 cache/premix.wav

# Two-pass loudnorm to -14 LUFS (social platforms' target), true peak under -1.5 dBTP.
measured=$(ffmpeg -hide_banner -nostats -i cache/premix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
read -r mi mtp mlra mth off <<< "$(python3 -I -c 'import sys, json; d = json.load(sys.stdin); print(d["input_i"], d["input_tp"], d["input_lra"], d["input_thresh"], d["target_offset"])' <<< "$measured")"
ffmpeg -y -loglevel error -i cache/premix.wav \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true,aresample=48000" \
  -ar 48000 cache/mix.wav
echo "mix: cache/mix.wav"
