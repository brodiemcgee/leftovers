#!/bin/bash
# Local TestFlight build pipeline for Leftovers — mirrors socialapp's zero-cost flow.
# Steps:
#   1. xcodegen regenerates the .xcodeproj from project.yml
#   2. xcodebuild archives Release without code signing
#   3. ad-hoc codesign embeds the entitlements file into the .app
#   4. xcodebuild -exportArchive signs with the Apple Distribution cert,
#      auto-creates/updates the App Store provisioning profile, and uploads
#      directly to App Store Connect (per ExportOptions.plist destination=upload)
#
# Prereqs:
#   - Xcode signed in with the Apple ID that owns Team W25KJK652Y
#   - Keychain has "Apple Distribution: BRODIE L MCGEE (W25KJK652Y)"
#   - /tmp/ExportOptions.plist exists (this script writes it if missing)
#   - App Store Connect record exists for bundle id com.brodiemcgee.leftovers
#
# Usage: ./build-ios.sh [--skip-bump]
#   By default, the buildNumber in Info.plist (CFBundleVersion) is auto-incremented
#   so each upload is unique. --skip-bump preserves the current value.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ARCHIVE_PATH="/tmp/Leftovers.xcarchive"
EXPORT_PATH="/tmp/Leftovers-export"
EXPORT_OPTIONS="/tmp/ExportOptions.plist"
INFO_PLIST="$SCRIPT_DIR/Leftovers/Info.plist"
ENTITLEMENTS="$SCRIPT_DIR/Leftovers/Leftovers.entitlements"

# 0. Ensure ExportOptions.plist exists
if [ ! -f "$EXPORT_OPTIONS" ]; then
  echo "==> Writing $EXPORT_OPTIONS"
  cat > "$EXPORT_OPTIONS" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>W25KJK652Y</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>upload</string>
</dict>
</plist>
PLIST
fi

# 1. Bump build number unless --skip-bump
if [ "${1:-}" != "--skip-bump" ]; then
  CURRENT=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST")
  NEXT=$((CURRENT + 1))
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEXT" "$INFO_PLIST"
  echo "==> Build number $CURRENT → $NEXT"
fi

# 2. Regenerate Xcode project
echo "==> xcodegen"
xcodegen generate

# 3. Clean previous artefacts
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"

# 4. Archive (no code signing)
echo "==> Archive"
xcodebuild archive \
  -project Leftovers.xcodeproj \
  -scheme Leftovers \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  | xcbeautify --quiet 2>/dev/null || true

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "❌ Archive failed — see Xcode log above"
  exit 1
fi

# 5. Embed entitlements (ad-hoc sign so aps-environment / SiwA are present)
echo "==> Embed entitlements"
codesign --force --sign "-" \
  --entitlements "$ENTITLEMENTS" \
  "$ARCHIVE_PATH/Products/Applications/Leftovers.app"

# 6. Export, sign with Distribution cert, and upload to TestFlight
echo "==> Export + upload to App Store Connect"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_PATH" \
  -allowProvisioningUpdates

echo ""
echo "✅ Upload complete. Watch processing at:"
echo "   https://appstoreconnect.apple.com/apps"
