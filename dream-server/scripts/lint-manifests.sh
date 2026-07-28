#!/usr/bin/env bash
# Purpose: Semantic linter for extension service manifests.
#
# Complements scripts/validate-manifests.sh (JSON schema + version compat)
# with cross-manifest integrity checks that require awareness of the full
# extension set:
#
#   1. Port uniqueness   — no two services share the same external_port_default
#   2. depends_on refs   — every referenced service ID must exist in the set
#   3. compose_file      — if declared, the file must exist in the extension dir
#   4. health path       — must start with /
#
# Expects:
#   python3 + PyYAML (same soft-dependency as validate-manifests.sh)
#   jq (hard dependency for manifest.json)
#
# Provides:
#   Exit 0  — no hard failures found
#   Exit 1  — one or more hard failures detected; summary printed to stdout
#
# Modder notes:
#   Add new checks inside the Python heredoc. Each check calls fail() or
#   warn() — fail() increments hard_failures and controls the exit code.
#
# Usage:
#   scripts/lint-manifests.sh [--quiet]
#
set -euo pipefail

ROOT_DIR="${LINT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MANIFEST_FILE="${ROOT_DIR}/manifest.json"
QUIET=false
[[ "${1:-}" == "--quiet" ]] && QUIET=true

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }
_pass()  { $QUIET || echo -e "${GREEN}[PASS]${NC}  $1"; }
_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
_info()  { $QUIET || echo -e "${BLUE}[INFO]${NC}  $1"; }

command -v jq >/dev/null 2>&1 || { echo "lint-manifests: jq is required" >&2; exit 1; }
[[ -f "$MANIFEST_FILE" ]] || { echo "lint-manifests: manifest.json not found" >&2; exit 1; }

EXT_DIR_REL="$(jq -r '.contracts.extensions.serviceDirectory' "$MANIFEST_FILE")"
EXT_DIR="${ROOT_DIR}/${EXT_DIR_REL%/}"

[[ -d "$EXT_DIR" ]] || { echo "lint-manifests: extensions directory not found: ${EXT_DIR_REL}" >&2; exit 1; }

$QUIET || echo ""
$QUIET || echo "╔════════════════════════════════════════════════════════╗"
$QUIET || echo "║   Dream Server Extension Manifest Linter              ║"
$QUIET || echo "╚════════════════════════════════════════════════════════╝"
$QUIET || echo ""

_info "Extensions directory: ${EXT_DIR_REL}"

# Check python3 + PyYAML
if ! python3 -c "import yaml" 2>/dev/null; then
  _warn "python3/PyYAML not available — cannot lint YAML manifests; skipping"
  echo ""
  echo "Result: 0 failures (skipped — PyYAML missing)"
  exit 0
fi

python3 - "$EXT_DIR" "$QUIET" <<'PYEOF'
import sys
import os
import yaml

ext_dir = sys.argv[1]
quiet   = sys.argv[2].lower() == "true"

RED    = "\033[0;31m"
GREEN  = "\033[0;32m"
YELLOW = "\033[1;33m"
BLUE   = "\033[0;34m"
NC     = "\033[0m"

hard_failures = 0
warnings      = 0

def fail(msg):
    global hard_failures
    print(f"  {RED}[FAIL]{NC}  {msg}")
    hard_failures += 1

def warn(msg):
    global warnings
    print(f"  {YELLOW}[WARN]{NC}  {msg}")
    warnings += 1

def info(msg):
    if not quiet:
        print(f"  {BLUE}[INFO]{NC}  {msg}")

def ok(msg):
    if not quiet:
        print(f"  {GREEN}[PASS]{NC}  {msg}")

# ------------------------------------------------------------------
# 1. Collect manifests
# ------------------------------------------------------------------
manifests = {}  # service_id -> {"manifest": dict, "path": str, "ext_dir": str}
service_ids = set()

for name in sorted(os.listdir(ext_dir)):
    ext_path = os.path.join(ext_dir, name)
    if not os.path.isdir(ext_path):
        continue
    for fname in ("manifest.yaml", "manifest.yml", "manifest.json"):
        mpath = os.path.join(ext_path, fname)
        if not os.path.isfile(mpath):
            continue
        try:
            with open(mpath) as f:
                doc = yaml.safe_load(f)
        except Exception as exc:
            fail(f"{name}/{fname}: YAML parse error — {exc}")
            break
        svc = (doc or {}).get("service", {})
        sid = svc.get("id")
        if sid:
            manifests[sid] = {"manifest": doc, "path": mpath, "ext_dir": ext_path}
            service_ids.add(sid)
        break

info(f"Found {len(manifests)} manifests with service IDs")

# ------------------------------------------------------------------
# 2. Port uniqueness
# ------------------------------------------------------------------
port_owners: dict[int, str] = {}
for sid, entry in manifests.items():
    svc = entry["manifest"].get("service", {})
    ep = svc.get("external_port_default")
    if ep is None:
        continue
    if ep in port_owners:
        fail(
            f"Port collision: external_port_default {ep} is claimed by both "
            f"'{port_owners[ep]}' and '{sid}'"
        )
    else:
        port_owners[ep] = sid

if not any(True for e in manifests.values() if e["manifest"].get("service", {}).get("external_port_default")):
    info("No external_port_default values declared — port uniqueness check skipped")
else:
    ok(f"Port uniqueness: {len(port_owners)} unique ports, no collisions")

# ------------------------------------------------------------------
# 3. depends_on references
# ------------------------------------------------------------------
bad_deps = False
for sid, entry in manifests.items():
    svc    = entry["manifest"].get("service", {})
    deps   = svc.get("depends_on", [])
    for dep in deps:
        if dep not in service_ids:
            fail(
                f"'{sid}': depends_on references unknown service '{dep}' "
                f"(not found in extensions/services/)"
            )
            bad_deps = True

if not bad_deps:
    ok("depends_on references: all referenced service IDs exist")

# ------------------------------------------------------------------
# 4. compose_file existence
# ------------------------------------------------------------------
bad_compose = False
for sid, entry in manifests.items():
    svc  = entry["manifest"].get("service", {})
    cf   = svc.get("compose_file")
    if not cf:
        continue
    full          = os.path.join(entry["ext_dir"], cf)
    full_disabled = full + ".disabled"
    if os.path.isfile(full):
        pass  # active compose — fine
    elif os.path.isfile(full_disabled):
        warn(
            f"'{sid}': compose_file '{cf}' is disabled "
            f"(found '{cf}.disabled') — extension will not start until re-enabled"
        )
    else:
        fail(
            f"'{sid}': compose_file '{cf}' declared in manifest but file not found at "
            f"extensions/services/{os.path.basename(entry['ext_dir'])}/{cf}"
        )
        bad_compose = True

if not bad_compose:
    ok("compose_file existence: all declared compose files present (active or disabled)")

# ------------------------------------------------------------------
# 5. health path format
# ------------------------------------------------------------------
bad_health = False
for sid, entry in manifests.items():
    svc    = entry["manifest"].get("service", {})
    health = svc.get("health")
    if health is None:
        continue
    if not health.startswith("/"):
        fail(f"'{sid}': health path '{health}' must start with '/'")
        bad_health = True

if not bad_health:
    ok("health path format: all health paths start with '/'")

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
print()
if hard_failures == 0:
    print(f"  {GREEN}✓ Lint passed{NC}  — {len(manifests)} manifests checked, {warnings} warnings")
else:
    print(f"  {RED}✗ Lint failed{NC}  — {hard_failures} failure(s), {warnings} warning(s)")
print()

sys.exit(0 if hard_failures == 0 else 1)
PYEOF
