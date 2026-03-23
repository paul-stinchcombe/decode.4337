# Signing & notarizing the Mac build

Use this runbook to produce a signed, notarized DMG that opens on recipient Macs without quarantine errors.

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
pnpm run build
pnpm run dist
```

The first notarization can take a few minutes. The output will be in **`release/`**, e.g.:

- `release/Decode 4337-<version>.dmg`

Share that DMG; recipients can open it without any “damaged” or quarantine workaround.

## 6. Optional: use a local env file (don’t commit it)

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
set -a && source .env.notarize && set +a
pnpm run build && pnpm run dist
```

### Optional helper script (`dist-mac.sh`)

The repository includes `dist-mac.sh`, which calls:

```bash
source ./build-env.sh
pnpm run dist
```

This is optional. If you use it, create a local `build-env.sh` (ignored by git) that exports `CSC_*` and `APPLE_*` variables. If you do not use it, running `pnpm run build && pnpm run dist` after exporting environment variables is sufficient.

## Troubleshooting

- **“notarize options were not provided”**  
  Ensure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set.

- **“The signature of the binary is invalid”**  
  Use the **Developer ID Application** certificate (not “Apple Development”) and ensure `CSC_LINK` points to the correct .p12.

- **Notarization timeout / Apple ID errors**  
  Confirm the app-specific password is correct and has no extra spaces. Use the latest Xcode command line tools: `xcode-select --install`.

- **`dist-mac.sh: build-env.sh: No such file`**
  `build-env.sh` is not committed by default. Either create it locally or run `pnpm run dist` directly in a shell where notarization variables are exported.
