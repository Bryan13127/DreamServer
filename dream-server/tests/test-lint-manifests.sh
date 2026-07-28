#!/usr/bin/env bash
# ============================================================================
# Dream Server lint-manifests.sh Test Suite
# ============================================================================
# Verifies that scripts/lint-manifests.sh runs and produces expected output.
# Smoke-tests the four semantic checks with synthetic fixtures.
#
# Usage: ./tests/test-lint-manifests.sh
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LINTER="$ROOT_DIR/scripts/lint-manifests.sh"
FIXTURES_DIR="$(mktemp -d)"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PASSED=0
FAILED=0

pass() { echo -e "  ${GREEN}✓ PASS${NC} $1"; PASSED=$((PASSED + 1)); }
fail() { echo -e "  ${RED}✗ FAIL${NC} $1"; FAILED=$((FAILED + 1)); }

cleanup() { rm -rf "$FIXTURES_DIR"; }
trap cleanup EXIT

echo ""
echo "╔═══════════════════════════════════════════════════╗"
echo "║   lint-manifests.sh Test Suite                   ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# ── Guard: script exists ──────────────────────────────────────────────────
if [[ ! -f "$LINTER" ]]; then
    fail "scripts/lint-manifests.sh not found"
    echo ""; echo "Result: $PASSED passed, $FAILED failed"; exit 1
fi
pass "lint-manifests.sh exists"

# ── Guard: jq available ───────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
    fail "jq not installed — skipping remaining checks"
    echo ""; echo "Result: $PASSED passed, $FAILED failed"; [[ $FAILED -eq 0 ]]; exit $?
fi
pass "jq available"

# ── Guard: python3 + PyYAML ───────────────────────────────────────────────
if ! python3 -c "import yaml" 2>/dev/null; then
    fail "python3/PyYAML not available — skipping fixture tests"
    echo ""; echo "Result: $PASSED passed, $FAILED failed"; [[ $FAILED -eq 0 ]]; exit $?
fi
pass "python3 + PyYAML available"

# ── Smoke test: real extensions pass ─────────────────────────────────────
set +e
out=$(cd "$ROOT_DIR" && bash scripts/lint-manifests.sh --quiet 2>&1)
exit_code=$?
set -e

if [[ $exit_code -eq 0 ]]; then
    pass "Real extension manifests pass lint (exit 0)"
else
    fail "Real extension manifests failed lint (exit $exit_code): $out"
fi

# ============================================================================
# Fixture helpers — build a synthetic extensions/services tree in a temp dir
# plus a minimal manifest.json that points at it.
# ============================================================================

_write_manifest_json() {
    local dir="$1"
    cat >"$dir/manifest.json" <<EOF
{
  "release": {"version": "2.0.0"},
  "contracts": {
    "extensions": {
      "serviceDirectory": "extensions/services/",
      "serviceManifestSchema": "extensions/schema/service-manifest.v1.json"
    }
  }
}
EOF
    mkdir -p "$dir/extensions/services"
    mkdir -p "$dir/extensions/schema"
    # Minimal schema — linter doesn't use it for semantic checks
    echo '{"$schema":"..."}' >"$dir/extensions/schema/service-manifest.v1.json"
}

_write_svc() {
    # _write_svc <base> <id> [extra yaml lines...]
    local base="$1" id="$2"
    shift 2
    local dir="$base/extensions/services/$id"
    mkdir -p "$dir"
    {
        echo "schema_version: dream.services.v1"
        echo "service:"
        echo "  id: $id"
        echo "  name: Test $id"
        echo "  port: 9000"
        echo "  health: /health"
        echo "  type: docker"
        echo "  gpu_backends: [all]"
        for extra in "$@"; do
            echo "  $extra"
        done
    } >"$dir/manifest.yaml"
}

# ── Fixture 1: port collision ─────────────────────────────────────────────
F1="$FIXTURES_DIR/f1"
mkdir -p "$F1"
_write_manifest_json "$F1"
_write_svc "$F1" alpha "external_port_default: 8100"
_write_svc "$F1" beta  "external_port_default: 8100"

set +e
out1=$(LINT_ROOT="$F1" bash "$LINTER" --quiet 2>&1; echo "EXIT:$?")
set -e
if echo "$out1" | grep -q "Port collision"; then
    pass "Port collision detected"
else
    fail "Port collision not detected: $out1"
fi
if echo "$out1" | grep -q "EXIT:1"; then
    pass "Port collision causes non-zero exit"
else
    fail "Port collision did not cause non-zero exit: $out1"
fi

# ── Fixture 2: bad depends_on reference ───────────────────────────────────
F2="$FIXTURES_DIR/f2"
mkdir -p "$F2"
_write_manifest_json "$F2"
_write_svc "$F2" svc-a
# Inject depends_on with a reference to non-existent 'ghost'
echo "  depends_on: [ghost]" >> "$F2/extensions/services/svc-a/manifest.yaml"

set +e
out2=$(LINT_ROOT="$F2" bash "$LINTER" --quiet 2>&1; echo "EXIT:$?")
set -e
if echo "$out2" | grep -q "depends_on references unknown service"; then
    pass "Bad depends_on reference detected"
else
    fail "Bad depends_on not detected: $out2"
fi

# ── Fixture 3: missing compose_file ──────────────────────────────────────
F3="$FIXTURES_DIR/f3"
mkdir -p "$F3"
_write_manifest_json "$F3"
_write_svc "$F3" svc-b "compose_file: compose.yaml"
# compose.yaml intentionally absent

set +e
out3=$(LINT_ROOT="$F3" bash "$LINTER" --quiet 2>&1; echo "EXIT:$?")
set -e
if echo "$out3" | grep -q "compose_file.*not found"; then
    pass "Missing compose_file detected"
else
    fail "Missing compose_file not detected: $out3"
fi

# ── Fixture 4: disabled compose_file produces warning, not failure ────────
F4="$FIXTURES_DIR/f4"
mkdir -p "$F4"
_write_manifest_json "$F4"
_write_svc "$F4" svc-c "compose_file: compose.yaml"
touch "$F4/extensions/services/svc-c/compose.yaml.disabled"

set +e
out4=$(LINT_ROOT="$F4" bash "$LINTER" 2>&1; echo "EXIT:$?")
set -e
if echo "$out4" | grep -q "\[WARN\].*disabled"; then
    pass "Disabled compose_file produces warning"
else
    fail "Disabled compose_file warning not found: $out4"
fi
if echo "$out4" | grep -q "EXIT:0"; then
    pass "Disabled compose_file does not cause failure"
else
    fail "Disabled compose_file caused unexpected failure: $out4"
fi

# ── Fixture 5: bad health path ────────────────────────────────────────────
F5="$FIXTURES_DIR/f5"
mkdir -p "$F5"
_write_manifest_json "$F5"
_write_svc "$F5" svc-d
# Overwrite health with bad value
sed -i 's|health: /health|health: health|' "$F5/extensions/services/svc-d/manifest.yaml"

set +e
out5=$(LINT_ROOT="$F5" bash "$LINTER" --quiet 2>&1; echo "EXIT:$?")
set -e
if echo "$out5" | grep -q "health path.*must start with"; then
    pass "Bad health path detected"
else
    fail "Bad health path not detected: $out5"
fi

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "Result: $PASSED passed, $FAILED failed"
[[ $FAILED -eq 0 ]]
