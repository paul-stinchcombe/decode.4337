# Signing & notarizing the Mac build (v1.0.1+)

Follow these steps once. After that, `pnpm run dist` will produce a DMG that opens for anyone, even when downloaded from Google Drive.

## 1. Apple Developer account

You need a **paid** Apple Developer account: https://developer.apple.com/programs/

## 2. Create a Developer ID Application certificate

1. In [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list), click **+**.
2. Under **Developer ID**, choose **Developer ID Application** and continue.
3. Create a Certificate Signing Request (CSR) on your Mac:
   - Open **Keychain Access** → menu **Keychain Access** → **Certificate Assistant** → **Request a Certificate From a Certificate Authority**.
   - Email: your Apple ID email. Common Name: e.g. `Decode 4337`. **Save to disk**.
4. Upload the CSR in the browser, download the certificate, and double‑click to add it to Keychain.

## 3. Export the certificate as a .p12 file

1. Open **Keychain Access**, find the **Developer ID Application: …** certificate.
2. Right‑click it → **Export**.
3. Save as e.g. `decode4337-cert.p12`. Set a **password** (you’ll use it as `CSC_KEY_PASSWORD`).
4. Keep this file and password private (e.g. don’t commit them). You can delete the .p12 from the keychain export after copying it to a safe place.

## 4. Get your Team ID and create an app-specific password

- **Team ID:** [Apple Developer → Membership](https://developer.apple.com/account#MembershipDetailsCard) → **Team ID** (e.g. `ABCD1234`).
- **App-specific password:** [appleid.apple.com](https://appleid.apple.com) → **Sign-In and Security** → **App-Specific Passwords** → generate one for “Decode 4337” or “electron notarize”. You’ll use it as `APPLE_APP_SPECIFIC_PASSWORD`.

## 5. Set environment variables and build

Set these **before** running the build (replace with your values):

```bash
# Signing (path to the .p12 you exported)
export CSC_LINK="$PWD/decode4337-cert.p12"
export CSC_KEY_PASSWORD="your-p12-password"

# Notarization (Apple ID and app-specific password)
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCD1234"
```

Then build and create the signed, notarized DMG:

```bash
(
set -euo pipefail
rm -rf dist release
pnpm run build
pnpm run dist
)
```

The clean step prevents deleted or renamed compiled files from surviving in
`dist/`, which `electron-builder` packages as-is. `pnpm run dist` does not run
the build or clean steps for you.

The first notarization can take a few minutes. The output will be in **`release/`**, e.g.:

- `release/Decode 4337-1.0.1.dmg`

Share that DMG; recipients can open it without any “damaged” or quarantine workaround.

## 6. Verify the release before sharing

Do not treat a successful `electron-builder` exit as the only release check.
Assess the DMG with Gatekeeper, then mount it and validate the notarization
ticket, signature, entitlements, and architecture of the app recipients will
run. Replace the filename if you built a different architecture:

```bash
(
set -euo pipefail

DMG="release/Decode 4337-1.0.1.dmg"
EXPECTED_ARCHS="arm64" # Use "x86_64" or "arm64 x86_64" when appropriate.
WORK_DIR="$(mktemp -d)"
MOUNT_POINT="$WORK_DIR/mount"
ENTITLEMENTS_FILE="$WORK_DIR/entitlements.plist"
mkdir "$MOUNT_POINT"
ATTACHED=false

cleanup() {
  status=$?
  if [ "$ATTACHED" = true ]; then
    hdiutil detach "$MOUNT_POINT" || status=$?
  fi
  rm -rf "$WORK_DIR" || status=$?
  exit "$status"
}
trap cleanup EXIT

spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG"
hdiutil attach "$DMG" -mountpoint "$MOUNT_POINT" -nobrowse
ATTACHED=true

APP="$MOUNT_POINT/Decode 4337.app"
xcrun stapler validate "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=4 "$APP"

SIGNING_DETAILS="$(codesign --display --verbose=4 "$APP" 2>&1)"
printf '%s\n' "$SIGNING_DETAILS"
case "$SIGNING_DETAILS" in
  *"flags="*"(runtime)"*) ;;
  *) echo "Missing hardened-runtime flag" >&2; exit 1 ;;
esac

codesign --display --entitlements :- "$APP" > "$ENTITLEMENTS_FILE"
plutil -p "$ENTITLEMENTS_FILE"
for key in \
  com.apple.security.cs.allow-jit \
  com.apple.security.cs.allow-unsigned-executable-memory \
  com.apple.security.cs.disable-library-validation
do
  value="$(/usr/libexec/PlistBuddy -c "Print :$key" "$ENTITLEMENTS_FILE")"
  [ "$value" = "true" ] || {
    echo "Missing required entitlement: $key" >&2
    exit 1
  }
done

ARCHS="$(lipo -archs "$APP/Contents/MacOS/Decode 4337")"
printf 'Architectures: %s\n' "$ARCHS"
for expected in $EXPECTED_ARCHS; do
  case " $ARCHS " in
    *" $expected "*) ;;
    *) echo "Missing expected architecture: $expected" >&2; exit 1 ;;
  esac
done

shasum -a 256 "$DMG"
)
```

Expected results:

- `stapler validate` reports that the mounted app's ticket is valid.
- Both `spctl` checks report `accepted`.
- `codesign --verify` reports no signature errors.
- The block exits nonzero if the signing details omit the `runtime` flag, any
  entitlement from `build/entitlements.mac.plist`, or an architecture listed
  in `EXPECTED_ARCHS`.

Record the local DMG checksum printed by the block. After uploading and
downloading through the intended sharing channel, run `shasum -a 256` on the
download and compare it, then install that copy on a Mac without the signing
certificate. Launch it with verbose output and decode this Base transaction:

```text
0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

Confirm the output reports `ABI: merged` (currently 104 functions), a
`transferFrom` call, and `0.02475 USDC`. The command checks validate
distribution metadata; this decode validates the packaged Electron,
artifact-loading, and decoder path.

## 7. Keep the hardened-runtime settings intact

The `package.json` Mac build applies `build/entitlements.mac.plist` to the app
and inherited processes while enabling the hardened runtime. The checked-in
entitlements grant JIT, unsigned executable-memory, and disabled
library-validation capabilities. These permissions are part of the current
signing configuration.

Treat changes to these files as release-signing changes, not cleanup. After any
change, rebuild the DMG and repeat the verification above; a locally launched
unsigned development build does not validate the packaged signature.

## 8. Optional: use a .env file (don’t commit it)

You can put the exports in a file and source it:

```bash
# .env.notarize (add to .gitignore)
CSC_LINK=/path/to/decode4337-cert.p12
CSC_KEY_PASSWORD=your-p12-password
APPLE_ID=your@apple.id
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=ABCD1234
```

Then:

```bash
(
set -euo pipefail
rm -rf dist release
set -a && source .env.notarize && set +a
pnpm run build && pnpm run dist
)
```

## Troubleshooting

- **“notarize options were not provided”**  
  Ensure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set.

- **“The signature of the binary is invalid”**  
  Use the **Developer ID Application** certificate (not “Apple Development”) and ensure `CSC_LINK` points to the correct .p12.

- **Notarization timeout / Apple ID errors**  
  Confirm the app-specific password is correct and has no extra spaces. Use the latest Xcode command line tools: `xcode-select --install`.
