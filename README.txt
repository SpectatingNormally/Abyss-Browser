CUSTOM YOUTUBE APP — REBUILT PACKAGE

This package keeps the existing Video Hub / custom YouTube interface and styling. It does not replace it with YouTube.com or redesign the app.

FILES
- index.html, style.css, script.js: app files
- config.js: Supabase project URL and browser-safe publishable key
- supabase-schema.sql: complete YouTube Supabase setup / repair SQL
- YOUTUBE-TABLE-AUDIT.sql: read-only table, RLS, Realtime, and storage audit

DEPLOY
1. Back up your YouTube Supabase project before making database changes.
2. Keep all six app/database files together in the same GitHub Pages folder.
3. Replace the existing custom YouTube app files with index.html, style.css, script.js, and config.js from this package. Keep the same deployed URL.
4. The SQL setup is included for reference. Since the previous setup already ran successfully, do not rerun it just because the frontend files changed. Only rerun it if a future database change specifically requires it.
5. In Supabase Auth settings, enable Anonymous Sign-Ins if you want guest identities for likes, comments, watch history, and progress. Video uploads still require a non-anonymous account.
6. Test with a guest, a regular account, and a second browser session.

FIXES IN THIS REBUILD
- If anonymous sign-in is unavailable, public guest browsing now still starts and loads the feed instead of stopping after the auth attempt.
- Video-view RPC errors are now surfaced in the console rather than silently treated as success.
- Realtime listeners now include watch history, playback progress, user blocks, and content reports; history and blocked-feed views refresh when relevant events arrive.

IMPORTANT
- This rebuild preserves the current UI, layout, and visual styling.
- The SQL is additive/repair-oriented and preserves legacy tables; do not delete legacy tables until you have verified the migrated data.
- This package was statically checked. It has not been tested against your live Supabase project or deployed in your GitHub Pages repository.
- Never put a Supabase service_role or sb_secret key in config.js. Only use the publishable key.
