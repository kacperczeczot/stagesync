#!/usr/bin/env bash
# JVM unit tests for StageSync Performer (no device). Skips cleanly without Android SDK
# so turbo/pnpm test stays green on machines without ANDROID_HOME.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  # Homebrew android-commandlinetools layout (common on macOS CI/dev).
  if [[ -d /opt/homebrew/share/android-commandlinetools ]]; then
    export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  else
    echo "@stagesync/performer: skip unit tests (set ANDROID_HOME / ANDROID_SDK_ROOT)" >&2
    exit 0
  fi
fi

# Auto-detect OpenJDK on macOS if JAVA_HOME is not explicitly set
if [[ -z "${JAVA_HOME:-}" && -d "/opt/homebrew/opt/openjdk@17" ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
  export PATH="$JAVA_HOME/bin:$PATH"
fi

cd "$ANDROID_DIR"
if [[ ! -f local.properties ]]; then
  SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  echo "sdk.dir=$SDK" > local.properties
fi

GRADLE_ARGS=()
# On FAT/exFAT external drives, macOS AppleDouble files (._*) cause AAPT/ParseLibraryResourcesTask to fail.
# Redirect buildDir to /tmp if current filesystem doesn't support native POSIX attributes or has AppleDouble risks.
if [[ "$ROOT" == /Volumes/* ]]; then
  GRADLE_ARGS+=("-PbuildDir=/tmp/stagesync-performer-build")
fi

./gradlew test --no-daemon "${GRADLE_ARGS[@]}" "$@"
