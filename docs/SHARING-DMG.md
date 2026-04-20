# Sharing the Decode 4337 DMG

If recipients see **"File is damaged"** or **"cannot be opened"** after downloading the DMG, macOS quarantine is usually the cause.

## Temporary workaround for recipients

After download, they can run one of these in Terminal:

**Before opening the DMG**
```bash
xattr -cr ~/Downloads/Decode\ 4337-<version>.dmg
```

**After moving the app to /Applications**
```bash
xattr -cr "/Applications/Decode 4337.app"
```

`xattr -cr` removes quarantine attributes; it does not alter application code.

## Proper fix for distribution: sign and notarize

The project is configured for signed + notarized macOS builds (`electron-builder` with notarization enabled).

Follow:

- [NOTARIZE-MAC.md](./NOTARIZE-MAC.md)

After notarization, the DMG in `release/` should open for recipients without requiring `xattr`.
