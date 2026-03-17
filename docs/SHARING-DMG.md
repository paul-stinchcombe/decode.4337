# Sharing the Decode 4337 DMG

If someone gets **"File is damaged"** or **"cannot be opened"** after downloading the DMG from Google Drive (or email, etc.), macOS has quarantined the file.

## Fix for the person who received the DMG

After downloading, open **Terminal** and run **one** of these (adjust the path if they saved it somewhere else):

**If they haven’t opened the DMG yet:**
```bash
xattr -cr ~/Downloads/Decode\ 4337-1.0.0.dmg
```
Then double-click the DMG and install as usual.

**If they already installed the app to Applications:**
```bash
xattr -cr "/Applications/Decode 4337.app"
```
Then they can open the app normally.

`xattr -cr` removes the quarantine flag macOS adds to downloaded files; it does not modify the app itself.

---

## Proper fix (so recipients never see "damaged"): Sign & notarize

For **v1.0.1+** the project is set up for code signing and notarization. Follow the step-by-step guide:

- **[NOTARIZE-MAC.md](./NOTARIZE-MAC.md)** – Apple Developer certificate, Team ID, app-specific password, env vars, and `pnpm run dist`.

After you build with signing and notarization, the DMG in `release/` can be shared (e.g. via Google Drive) and will open for recipients without any Terminal workaround.
