# FERU CINEMA — Zero-cost portable edition

A mobile-first, offline-capable production workspace designed for Android browsers. This edition is plain HTML, CSS and JavaScript: no build step, API keys, paid services, accounts, analytics or backend.

## Included in this milestone

- Create and manage feature-film and series production records.
- Enforce FERU's rules: films 40+ minutes; series episodes 25+ minutes; series 6+ episodes.
- Search the production slate and update production status/progress.
- Import and catalogue local production assets in IndexedDB (including GLB/glTF, images, audio, video and documents).
- Export a full JSON backup including imported file data; restore a backup on this or another browser.
- Installable PWA manifest and service worker for offline app-shell use.
- Responsive interface for phone and desktop.

## Open in a browser

Extract the ZIP and serve this folder from a local static web server or any HTTPS static host. `index.html` can be viewed directly for basic browser use, but browser security rules prevent service-worker registration and PWA installation from a `file://` address.

## Install on Android

1. Put the folder on a static HTTPS host you control or use a free static-hosting option. There are no hosting fees in this source package; an external host is optional and has its own terms/limits.
2. Open the HTTPS address in Chrome on Android.
3. Open Chrome's menu and choose **Install app** or **Add to Home screen** when offered.
4. Open FERU CINEMA from the home screen. After the first successful load, the app shell can open offline.

PWA installation requires HTTPS (or localhost). This package does not silently deploy or upload your files anywhere.

## Local data and backups

Projects are saved in this browser's local storage. Asset file bytes are saved in IndexedDB. Browser data can be cleared by Android storage cleanup, browser settings, or uninstalling the browser; export backups regularly and store them outside the browser. Backups can be large because they include imported assets.

Tap **Backup** to export a complete backup. Long-press **Backup** on touch devices (or right-click on desktop) to select a backup JSON file for restore. Restore replaces the current local workspace after confirmation.

## Current limitations

This is the offline foundation milestone, not the complete 3D production suite. It catalogues GLB/glTF and other assets but does not yet render imported 3D models, provide a full animation timeline, or render/export finished films. Those capabilities should be added in later, phone-tested milestones using locally bundled open-source libraries and no remote paid APIs.

## Cost and licensing

- No paid APIs or external fonts are used.
- No backend, account, analytics, subscription, or API credential is required.
- You are responsible for checking licences and usage rights for every imported model, texture, sound and video.
- This project is provided as a portable starting point; external hosting, if chosen, is governed by that provider's current terms.
