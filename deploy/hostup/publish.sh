#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd /srv/media-hub/v2
exec 9>/run/lock/mediahub-deploy.lock
flock 9

api=artifacts/api-server/dist
web=artifacts/media-tracker/dist/public
stage=$(mktemp -d .hostup-release.XXXXXXXX)
api_saved=0
web_saved=0
committed=0
cleanup() {
  local status=$?
  trap - EXIT
  if (( ! committed && (api_saved || web_saved) )); then
    set +e
    local restored=1
    if (( web_saved )); then
      rm -rf -- "$web" && mv -T -- "$stage/old-web" "$web" || restored=0
    fi
    if (( api_saved )); then
      rm -rf -- "$api" && mv -T -- "$stage/old-api" "$api" || restored=0
    fi
    docker restart mediahub-v2-tmdb >/dev/null || restored=0
    if (( ! restored )); then
      echo "Rollback failed. Review $stage on the VPS." >&2
      exit 1
    fi
  fi
  rm -rf -- "$stage"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

[[ -d "$api" && ! -L "$api" && -d "$web" && ! -L "$web" ]]
# The restricted SSH command supplies a release archive on standard input.
python3 - "$stage" 3<&0 <<'PY'
import os
import sys
import tarfile
from pathlib import PurePosixPath

count = 0
size = 0
with os.fdopen(3, "rb") as stream, tarfile.open(fileobj=stream, mode="r|gz") as archive:
    for member in archive:
        path = PurePosixPath(member.name)
        count += 1
        size += member.size
        if (
            count > 20000 or size > 512 * 1024 * 1024
            or path.is_absolute() or ".." in path.parts
            or not path.parts or path.parts[0] not in ("api", "web")
            or not (member.isfile() or member.isdir())
        ):
            raise SystemExit("Invalid release archive")
        archive.extract(member, sys.argv[1], filter="data")
PY
[[ -f "$stage/api/hostup-test.mjs" && -f "$stage/web/index.html" ]]
chmod -R a+rX "$stage/api" "$stage/web"

# Preserve hashed assets for browsers that still have the previous page open.
if [[ -d "$web/assets" && -d "$stage/web/assets" ]]; then
  cp -an "$web/assets/." "$stage/web/assets/"
fi

mv -T -- "$api" "$stage/old-api"
api_saved=1
mv -T -- "$stage/api" "$api"
mv -T -- "$web" "$stage/old-web"
web_saved=1
mv -T -- "$stage/web" "$web"
docker restart mediahub-v2-tmdb >/dev/null

for attempt in {1..30}; do
  if curl -fsS --max-time 3 https://media.emmyzettergren.se/api/healthz |
      grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' &&
     curl -fsS --max-time 3 https://media.emmyzettergren.se/ |
      cmp -s "$web/index.html" -; then
    committed=1
    echo "Media Hub published and verified."
    exit 0
  fi
  sleep 1
done
echo "Health check failed. Restoring the previous build." >&2
exit 1
