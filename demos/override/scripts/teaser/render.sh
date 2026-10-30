#!/usr/bin/env bash
# Renders the 10 s teaser in both cuts: out/arbiter-teaser-{16x9,9x16}.mp4 (with sound) and -silent.mp4.
# Needs cache/plate-native.png (node plate.mjs against a running rehearsal server) and cache/mix.wav (./audio.sh).
set -euo pipefail
cd "$(dirname "$0")"
[ -s cache/plate-native.png ] || { echo "missing cache/plate-native.png: run node plate.mjs first" >&2; exit 1; }
[ -s cache/plate8x.png ] || ffmpeg -y -loglevel error -i cache/plate-native.png -vf "scale=iw*8:ih*8:flags=neighbor" cache/plate8x.png
[ -s cache/mix.wav ] || ./audio.sh
mkdir -p out
for aspect in ${@:-16x9 9x16}; do
  node frames.mjs "$aspect" - | ffmpeg -y -loglevel error -f image2pipe -framerate 30 -c:v png -i - -i cache/mix.wav \
    -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart -t 10 "out/arbiter-teaser-$aspect.mp4"
  ffmpeg -y -loglevel error -i "out/arbiter-teaser-$aspect.mp4" -map 0:v -c copy -movflags +faststart "out/arbiter-teaser-$aspect-silent.mp4"
  echo "wrote out/arbiter-teaser-$aspect.mp4 and -silent.mp4"
done
