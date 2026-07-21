#!/usr/bin/env bash
# Download Piper voice models into public/models/ (not committed to git).
# Tries hf-mirror.com first (for networks where huggingface.co is unreachable).
set -euo pipefail

BASE_URLS=("https://hf-mirror.com" "https://huggingface.co")
REPO_PATH="diffusionstudio/piper-voices/resolve/main"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/public/models"
VOICES=("hfc_female" "hfc_male" "lessac")

mkdir -p "$DEST_DIR"

for voice in "${VOICES[@]}"; do
  for ext in onnx onnx.json; do
    file="en_US-${voice}-medium.${ext}"
    src_path="en/en_US/${voice}/medium/${file}"
    dest="${DEST_DIR}/${file}"

    if [[ -s "$dest" ]]; then
      echo "已存在，跳过: ${file}"
      continue
    fi

    ok=0
    for base in "${BASE_URLS[@]}"; do
      echo "下载 ${file} <- ${base}"
      if curl -fL --retry 3 -o "$dest" "${base}/${REPO_PATH}/${src_path}"; then
        ok=1
        break
      fi
    done

    if [[ $ok != 1 ]]; then
      rm -f "$dest"
      echo "下载失败: ${file}" >&2
      exit 1
    fi
  done
done

echo "全部模型下载完成 -> $DEST_DIR"
