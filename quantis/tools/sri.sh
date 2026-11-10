#!/bin/sh
# Print the SRI hash of a URL (or local file): tools/sri.sh https://cdn.jsdelivr.net/npm/x@1.2.3/dist/x.js
if [ -f "$1" ]; then cat "$1"; else curl -fsSL "$1"; fi | openssl dgst -sha384 -binary | openssl base64 -A | sed 's/^/sha384-/'; echo
