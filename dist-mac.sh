#!/usr/bin/env bash
# Run this to build a signed + notarized Mac DMG (sources build-env.sh so CSC_* and APPLE_* are set).
set -e
cd "$(dirname "$0")"
source ./build-env.sh
pnpm run dist
