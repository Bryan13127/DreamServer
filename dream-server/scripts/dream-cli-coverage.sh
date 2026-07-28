#!/usr/bin/env bash
# Purpose: Report dream-cli command test coverage.
#
# Scans dream-cli for every cmd_<name>() function definition, then checks
# tests/ for files that reference that command name.  Prints a two-column
# gap report (covered / uncovered) plus a summary line.
#
# Expects:
#   dream-cli   — present in ROOT_DIR
#   tests/      — directory of test scripts to search
#
# Provides:
#   Exit 0  — always (this is a reporting tool, not a gate)
#   Stdout  — human-readable coverage table
#
# Usage:
#   scripts/dream-cli-coverage.sh [--uncovered-only]
#
# Modder notes:
#   "covered" means at least one file in tests/ contains the string
#   "cmd_<name>" (function call site) or " <name>" as a positional argument
#   to the dream CLI (e.g. "dream status", "dream enable").  Both patterns
#   are checked to avoid false negatives.
#
set -euo pipefail

ROOT_DIR="${COVERAGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CLI="$ROOT_DIR/dream-cli"
TESTS_DIR="$ROOT_DIR/tests"
UNCOVERED_ONLY=false
[[ "${1:-}" == "--uncovered-only" ]] && UNCOVERED_ONLY=true

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

[[ -f "$CLI" ]]      || { echo "dream-cli-coverage: dream-cli not found at $CLI" >&2; exit 1; }
[[ -d "$TESTS_DIR" ]] || { echo "dream-cli-coverage: tests/ not found at $TESTS_DIR" >&2; exit 1; }

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   Dream Server — dream-cli Command Coverage Report    ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo -e "${BLUE}[INFO]${NC}  Scanning: $CLI"
echo -e "${BLUE}[INFO]${NC}  Tests:    $TESTS_DIR"
echo ""

# ── Extract all cmd_* function names ─────────────────────────────────────
mapfile -t commands < <(
    grep -Eo '^cmd_[a-z_]+\(\)' "$CLI" \
        | sed 's/()$//' \
        | sed 's/^cmd_//' \
        | sort -u
)

if [[ ${#commands[@]} -eq 0 ]]; then
    echo "No cmd_* functions found in dream-cli."
    exit 0
fi

echo -e "${BLUE}[INFO]${NC}  Found ${#commands[@]} commands in dream-cli"
echo ""

# Column header
printf "  %-20s  %-12s  %s\n" "COMMAND" "STATUS" "TEST FILES"
printf "  %-20s  %-12s  %s\n" "$(printf '%0.s─' {1..20})" "$(printf '%0.s─' {1..12})" "$(printf '%0.s─' {1..30})"

covered=0
uncovered=0
declare -a uncovered_list=()

for cmd in "${commands[@]}"; do
    # Search for cmd_<name> (function call) OR "dream <name>" / "'<name>'" argument patterns
    # across all test files (shell scripts and python)
    matched_files=()
    while IFS= read -r -d '' fpath; do
        if grep -qE "cmd_${cmd}[^a-z_]|dream[[:space:]]+(--[^[:space:]]+ +)*${cmd}[^a-z_]|[\"'][[:space:]]*${cmd}[[:space:]]|\"${cmd}\"" "$fpath" 2>/dev/null; then
            matched_files+=("$(basename "$fpath")")
        fi
    done < <(find "$TESTS_DIR" -maxdepth 2 \( -name "*.sh" -o -name "*.py" \) -print0 2>/dev/null)

    if [[ ${#matched_files[@]} -gt 0 ]]; then
        $UNCOVERED_ONLY && { covered=$((covered + 1)); continue; }
        # Show up to 3 file names to keep output compact
        files_str="${matched_files[*]}"
        if [[ ${#matched_files[@]} -gt 3 ]]; then
            files_str="${matched_files[0]}, ${matched_files[1]}, ${matched_files[2]} (+$((${#matched_files[@]} - 3)) more)"
        fi
        printf "  ${GREEN}%-20s${NC}  ${GREEN}%-12s${NC}  %s\n" "$cmd" "covered" "$files_str"
        covered=$((covered + 1))
    else
        printf "  ${RED}%-20s${NC}  ${RED}%-12s${NC}  %s\n" "$cmd" "UNCOVERED" "—"
        uncovered=$((uncovered + 1))
        uncovered_list+=("$cmd")
    fi
done

echo ""
printf "  %-20s  %-12s\n" "$(printf '%0.s─' {1..20})" "$(printf '%0.s─' {1..12})"

total=$(( covered + uncovered ))
pct=0
[[ $total -gt 0 ]] && pct=$(( covered * 100 / total ))

if [[ $uncovered -eq 0 ]]; then
    echo -e "  ${GREEN}✓ Coverage: ${covered}/${total} (${pct}%)${NC}  — all commands have test references"
else
    echo -e "  ${YELLOW}⚠ Coverage: ${covered}/${total} (${pct}%)${NC}  — ${uncovered} command(s) have no test references"
    echo ""
    echo -e "  ${RED}Uncovered commands:${NC}"
    for c in "${uncovered_list[@]}"; do
        echo -e "    ${RED}•${NC} $c"
    done
fi

echo ""
