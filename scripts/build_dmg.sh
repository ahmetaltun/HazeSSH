#!/usr/bin/env bash
# scripts/build_dmg.sh
# Automated DMG builder for HazeSSH
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== HazeSSH macOS DMG Builder ==="
echo "Project Root: $PROJECT_ROOT"

# Ensure Python 3 is available
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is required to build the DMG." >&2
    exit 1
fi

# Detect or create Python virtual environment
VENV_DIR="$PROJECT_ROOT/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment in .venv..."
    python3 -m venv "$VENV_DIR"
fi

# Check for required python packages (dmgbuild, pillow)
if ! "$VENV_DIR/bin/python3" -c "import dmgbuild, PIL" &>/dev/null; then
    echo "Installing required Python dependencies (dmgbuild, pillow)..."
    "$VENV_DIR/bin/pip" install --quiet dmgbuild pillow
fi

# Run build_dmg.py with all provided arguments
"$VENV_DIR/bin/python3" "$SCRIPT_DIR/build_dmg.py" "$@"
