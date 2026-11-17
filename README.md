# Abyss Browser

Static browser-style web app with optional Supabase accounts/cloud sync and local MP4 conversion through FFmpeg.wasm.

## Main frontend files

- `index.html`
- `style.css`
- `script.js`

## Deploy

This repository includes a GitHub Actions workflow. Set **Settings → Pages → Source → GitHub Actions**. On each push to `main`, the workflow installs the pinned FFmpeg.wasm packages, builds the static output, and deploys it to GitHub Pages.

Read `GITHUB-PAGES-TUTORIAL.txt` for the full beginner walkthrough and `SETUP-SUPABASE.txt` for the SQL/authentication setup.

## Video conversion

FFmpeg.wasm runs on the visitor's device. GitHub Pages hosts the FFmpeg files but does not process videos. YouTube links are embedded only; upload a local video file you own or are authorized to convert.
