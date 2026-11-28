#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")" && pwd)
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:?Set ANDROID_SDK_ROOT or ANDROID_HOME}}
tools="$sdk/build-tools/34.0.0"
platform="$sdk/platforms/android-34/android.jar"
output=${1:?Pass the output APK path}
mkdir -p "$(dirname "$output")"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/classes" "$work/dex"

"$tools/aapt2" compile --dir "$root/res" -o "$work/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$root/AndroidManifest.xml" \
  -o "$work/unsigned.apk" "$work/resources.zip"
javac --release 8 -classpath "$platform" -d "$work/classes" "$root/src/se/mediahub/tv/MainActivity.java"
jar cf "$work/classes.jar" -C "$work/classes" .
"$tools/d8" --min-api 23 --lib "$platform" --output "$work/dex" "$work/classes.jar"
(cd "$work/dex" && zip -q "$work/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

keytool -genkeypair -keystore "$work/preview.jks" -storepass android -keypass android \
  -alias mediahub-preview -dname "CN=MediaHub TV Preview" -keyalg RSA -keysize 2048 -validity 3650
"$tools/apksigner" sign --ks "$work/preview.jks" --ks-pass pass:android \
  --out "$output" "$work/aligned.apk"
"$tools/apksigner" verify "$output"
