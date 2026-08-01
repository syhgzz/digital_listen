#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST_DIR="$ROOT_DIR/public/models"
MANIFEST="$ROOT_DIR/scripts/model-checksums.json"
REVISION="$(node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).revision)' "$MANIFEST")"
BASE_URL="https://huggingface.co/diffusionstudio/piper-voices/resolve/$REVISION/en/en_US/lessac/medium"

mkdir -p "$DEST_DIR"

checksum() {
  local file="$1"
  local actual
  if command -v sha256sum >/dev/null 2>&1; then
    read -r actual _ < <(sha256sum "$file")
  else
    read -r actual _ < <(shasum -a 256 "$file")
  fi
  printf '%s' "$actual"
}

expected_checksum() {
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(data.files[process.argv[2]])' "$MANIFEST" "$1"
}

download_file() {
  local file="$1"
  local target="$DEST_DIR/$file"
  local expected
  expected="$(expected_checksum "$file")"

  if [[ -f "$target" ]] && [[ "$(checksum "$target")" == "$expected" ]]; then
    printf 'Verified %s\n' "$file"
    return
  fi

  local temporary="$target.download"
  rm -f "$temporary"
  curl -fL --retry 3 --retry-delay 2 -o "$temporary" "$BASE_URL/$file"

  local actual
  actual="$(checksum "$temporary")"
  if [[ "$actual" != "$expected" ]]; then
    rm -f "$temporary"
    printf 'Checksum mismatch for %s\nExpected: %s\nActual:   %s\n' "$file" "$expected" "$actual" >&2
    exit 1
  fi

  mv "$temporary" "$target"
  printf 'Downloaded and verified %s\n' "$file"
}

download_file "en_US-lessac-medium.onnx"
download_file "en_US-lessac-medium.onnx.json"
