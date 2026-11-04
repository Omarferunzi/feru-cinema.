# Manual acceptance checks

1. Open `index.html` through a static web server. The overview loads without network calls to third-party services.
2. Create a 39-minute film: it must be rejected. Create a 40-minute film: it must be saved.
3. Create a 24-minute episode series: it must be rejected. Create a 25-minute, 5-episode series: it must be rejected. Create a 25-minute, 6-episode series: it must be saved.
4. Search the productions page and open a production card. Change status/progress, save, refresh, and confirm the record remains.
5. Import an image or GLB file. Confirm it appears in the asset library after refresh; remove it and confirm it disappears.
6. Export a backup, clear browser data in a test profile, restore the backup and confirm productions and imported assets return.
7. On an HTTPS origin in Android Chrome, install the PWA, load once, enable airplane mode, reopen it, and confirm the app shell still loads.
8. Confirm the app functions without API keys, sign-in, paid tokens, subscriptions or remote fonts.
