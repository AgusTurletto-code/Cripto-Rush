#!/bin/bash
# Arma el video: cuadros del juego + textos con aparición suave + pantalla final con zoom.
set -e
L=${1:-es}
cd "$(dirname "$0")"
ov() { echo "[$1:v]format=rgba,fade=t=in:st=$2:d=0.25:alpha=1,fade=t=out:st=$3:d=0.25:alpha=1[o$1]"; }
ffmpeg -y -loglevel error \
  -framerate 30 -i frames/f%04d.png \
  -loop 1 -t 3 -i ov-$L-end.png \
  -loop 1 -t 13 -i ov-$L-intro.png -loop 1 -t 13 -i ov-$L-coins.png -loop 1 -t 13 -i ov-$L-rocket.png -loop 1 -t 13 -i ov-$L-wheel.png \
  -f lavfi -t 16 -i anullsrc=r=44100:cl=stereo \
  -filter_complex "\
$(ov 2 0.15 2.45);$(ov 3 3.0 6.15);$(ov 4 6.95 9.35);$(ov 5 9.9 12.75);\
[0:v]format=rgba[g];[g][o2]overlay[a];[a][o3]overlay[b];[b][o4]overlay[c];[c][o5]overlay,format=yuv420p,setsar=1[v0];\
[1:v]scale=2160:3840,zoompan=z='min(zoom+0.0007,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[v1];\
[v0][v1]concat=n=2:v=1:a=0[v]" \
  -map "[v]" -map 6:a -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 64k -shortest -movflags +faststart \
  crypto-rush-video-$L.mp4
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,r_frame_rate -of compact crypto-rush-video-$L.mp4
