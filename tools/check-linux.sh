#!/bin/sh
# `sh tools/check-linux.sh`: runs `bun run check` on Linux, in a container, with the browser tests on. It needs Podman
# or Docker. The container reads this folder without writing to it: it copies the files into its own home, installs
# Chromium and the tools the browser tests use from Debian, runs `bun install --frozen-lockfile`, then the check.
# The Bun image is pinned by its tag and its digest; Debian's Chromium is the one current for the image's release,
# and the run prints its version. DejaVu is Debian's default face: without it, the generic sans-serif falls to a
# monospace face, which no Linux desktop shows.
set -eu

IMAGE="docker.io/oven/bun:1.4.4-debian@sha256:93d5032fe06d163427822dc1598f420363759bb18155c9cc90eb1be05a64a19e"
ENGINE="${CONTAINER_ENGINE:-}"
if [ -z "$ENGINE" ]; then
  if command -v podman >/dev/null 2>&1; then ENGINE=podman
  elif command -v docker >/dev/null 2>&1; then ENGINE=docker
  else
    echo "check-linux: neither podman nor docker is found: install one, or set CONTAINER_ENGINE to its program" >&2
    exit 1
  fi
fi
NAME="${CHECK_LINUX_NAME:-prototype-check-linux-$$}"
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

exec "$ENGINE" run --rm --name "$NAME" --volume "$ROOT:/src:ro" --env CHROME_BIN=/usr/bin/chromium "$IMAGE" sh -euc '
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends chromium fonts-dejavu-core fonts-liberation lsof procps >/dev/null
  chromium --version
  bun --version
  mkdir -p /home/bun/work
  tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./.git --exclude=./.prototype -cf - . | tar -C /home/bun/work -xf -
  chown -R bun:bun /home/bun/work
  exec su bun -s /bin/sh -c "cd /home/bun/work && bun install --frozen-lockfile && bun run check"
'
