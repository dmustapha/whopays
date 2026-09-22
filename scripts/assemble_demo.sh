#!/bin/bash
# WhoPays demo assembler. Per-scene: build 1080p30 video = VO_dur + gap, mux Charon VO, concat.
# Single voice (Charon) already generated in video/audio/s{1..6}.wav. No system TTS anywhere.
set -e
cd "$(dirname "$0")/.."
IN=public/video; A=video/audio; T=/tmp/asm; OUT=video/out
mkdir -p "$T" "$OUT"
GAP=0.7   # breathing room appended after each scene's VO (pacing_mode=gap)
LEAD=0.35 # silence before VO starts within a scene

norm() { # $1 in  $2 start  $3 dur  $4 out  — cut + scale/pad to 1080p30
  ffmpeg -y -v error -ss "$2" -t "$3" -i "$1" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" \
    -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$4"
}

concat_segs() { # $1 out ; rest = seg files
  out="$1"; shift; : > "$T/list.txt"; for f in "$@"; do echo "file '$f'" >> "$T/list.txt"; done
  ffmpeg -y -v error -f concat -safe 0 -i "$T/list.txt" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$out"
}

vo_dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$A/s$1.wav"; }

build_scene() { # $1 idx ; $2 target_video (built) ; uses VO to set final dur, freeze-pads if short
  idx=$1; vid=$2
  vd=$(vo_dur $idx); target=$(python3 -c "print(round($vd + $LEAD + $GAP,2))")
  # pad/trim video to target via tpad (freeze last frame) then trim
  ffmpeg -y -v error -i "$vid" -vf "tpad=stop_mode=clone:stop_duration=30,fps=30" -t "$target" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$T/v$idx.mp4"
  # audio: LEAD silence + VO + pad to target, loudnorm
  ffmpeg -y -v error -f lavfi -t "$LEAD" -i anullsrc=r=24000:cl=mono -i "$A/s$idx.wav" \
    -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[a];[a]apad,atrim=0:$target,loudnorm=I=-16:TP=-1.5:LRA=11[o]" -map "[o]" -ar 48000 -ac 2 "$T/a$idx.wav"
  ffmpeg -y -v error -i "$T/v$idx.mp4" -i "$T/a$idx.wav" -c:v copy -c:a aac -b:a 192k -shortest "$T/scene$idx.mp4"
  echo "  scene$idx built: target=${target}s (VO=${vd}s)"
}

echo "=== scene 1 (freeze-pad full clip) ==="
norm "$IN/scene1.mov" 0 11.3 "$T/s1a.mp4"; concat_segs "$T/s1.mp4" "$T/s1a.mp4"; build_scene 1 "$T/s1.mp4"

echo "=== scene 2 (join + board react) ==="
norm "$IN/scene2.mov" 0 15.6 "$T/s2a.mp4"; concat_segs "$T/s2.mp4" "$T/s2a.mp4"; build_scene 2 "$T/s2.mp4"

echo "=== scene 3 (kill-shot, skip end tab-switch) ==="
norm "$IN/scene3.mov" 1.0 18.4 "$T/s3a.mp4"; concat_segs "$T/s3.mp4" "$T/s3a.mp4"; build_scene 3 "$T/s3.mp4"

echo "=== scene 4 (dues+reply | CUT editor 11-19s | board green 22.6+) ==="
norm "$IN/scene4.mov" 0.5 9.3 "$T/s4a0.mp4"     # Gmail dues + reply
ffmpeg -y -v error -i "$T/s4a0.mp4" -vf "setpts=1.7*PTS,fps=30" -an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p "$T/s4a.mp4"  # slow ~15s (read the dues email)
norm "$IN/scene4.mov" 22.6 4.4 "$T/s4b.mp4"     # board: evicted->green flip + hold (past the editor)
concat_segs "$T/s4.mp4" "$T/s4a.mp4" "$T/s4b.mp4"; build_scene 4 "$T/s4.mp4"

echo "=== scene 5 (click | signup | paste | CUT load | result cards) ==="
norm "$IN/scene5.mov" 0 3.0 "$T/s5a.mp4"        # board + RUN YOUR OWN BILL
norm "$IN/scene5.mov" 3.5 4.0 "$T/s5b.mp4"      # signup glimpse (Convex Auth)
norm "$IN/scene5.mov" 12.0 4.0 "$T/s5c.mp4"     # paste URL
norm "$IN/scene5.mov" 24.5 5.0 "$T/s5d.mp4"     # extracted plan cards (payoff)
concat_segs "$T/s5.mp4" "$T/s5a.mp4" "$T/s5b.mp4" "$T/s5c.mp4" "$T/s5d.mp4"; build_scene 5 "$T/s5.mp4"

echo "=== scene 6 (honest close, freeze-pad) ==="
norm "$IN/scene6.mov" 0 11.5 "$T/s6a.mp4"; concat_segs "$T/s6.mp4" "$T/s6a.mp4"; build_scene 6 "$T/s6.mp4"

echo "=== final concat ==="
concat_segs_av() { out="$1"; shift; : > "$T/flist.txt"; for f in "$@"; do echo "file '$f'" >> "$T/flist.txt"; done
  ffmpeg -y -v error -f concat -safe 0 -i "$T/flist.txt" -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$out"; }
concat_segs_av "$OUT/demo.mp4" "$T/scene1.mp4" "$T/scene2.mp4" "$T/scene3.mp4" "$T/scene4.mp4" "$T/scene5.mp4" "$T/scene6.mp4"
echo "=== DONE ==="
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/demo.mp4"
