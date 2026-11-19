# ffmpeg.wasm (self-hosted)

- ffmpeg.js, 814.ffmpeg.js (worker) – @ffmpeg/ffmpeg 0.12.15 (dist/umd), global `FFmpegWASM`
- ffmpeg-util.js – @ffmpeg/util 0.12.2 (dist/umd) – NOT used: its umd build references `exports` and breaks in the browser
- ffmpeg-core.js / ffmpeg-core.wasm – @ffmpeg/core 0.12.10 (single thread, no SharedArrayBuffer/COOP/COEP needed)

ffmpeg.js loads the worker 814.ffmpeg.js from its own directory -> keep the files together.
Used by the CmsPage system/videorecorder. License: MIT (ffmpeg.wasm), core GPL (contains x264).
