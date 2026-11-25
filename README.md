# Abyss Desktop (development starter)

This wraps the supplied Abyss web app in a standalone Electron desktop window and serves its existing files from a loopback-only local server. It preserves the current app, Supabase/Brave configuration, YouTube source folder, and SQL files. The desktop tab strip is enlarged to feel closer to Chrome.

## Build on your computer
1. Install Node.js 20 or newer.
2. Open a terminal in this folder (the folder containing this package.json).
3. Run `npm install`.
4. Run `npm start` to launch the desktop development build.
5. Run `npm run dist:win` for a Windows installer, `npm run dist:mac` for macOS, or `npm run dist:linux` for Linux.

## Extension support status
This first desktop shell is **not yet a full Chrome-extension-compatible browser**. Electron does not automatically provide complete Chrome Web Store/WebExtensions compatibility. Tampermonkey and VPN extensions must not be advertised as working until an extension-capable Chromium runtime and the required APIs have been integrated and tested. A browser-extension architecture is the next engineering stage. A VPN extension also may only proxy browser traffic; it does not automatically create a device-wide VPN.

## Important
- This is source code, not a prebuilt Windows `.exe` or macOS `.dmg`. Build the installer on the target operating system.
- Existing embedded websites may still refuse iframe embedding due to their own security policies.
- Keep API secrets out of frontend files. The existing Brave proxy remains a separate server-side service.
