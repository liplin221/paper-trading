#!/usr/bin/env python3
"""Push a local quant-result JSON file to an ATLAS server."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    parser.add_argument("--url", default=os.getenv("ATLAS_API_URL", ""))
    parser.add_argument("--token", default=os.getenv("ATLAS_API_TOKEN", ""))
    args = parser.parse_args()
    if not args.url or not args.token:
        parser.error("set --url/ATLAS_API_URL and --token/ATLAS_API_TOKEN")

    payload = json.loads(args.file.read_text(encoding="utf-8"))
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    endpoint = args.url.rstrip("/") + "/api/v1/quant/runs"
    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {args.token}",
            "Content-Type": "application/json",
            "X-Idempotency-Key": payload["run_id"],
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            print(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        print(exc.read().decode("utf-8"), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
