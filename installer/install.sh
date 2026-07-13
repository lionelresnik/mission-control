#!/usr/bin/env bash
set -e

CC_DIR="$HOME/.mission-control"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
CURSOR_DIR="$HOME/.cursor"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${BLUE}[cc]${NC} $1"; }
ok()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }

echo ""
echo "  ⚡ Mission Control v2 — Installer"
echo "  ─────────────────────────────────"
echo ""

# ─── 1. Data directory ───────────────────────────────────────────────────────

log "Creating data directory at $CC_DIR"
mkdir -p \
  "$CC_DIR/docs/architecture" \
  "$CC_DIR/docs/services" \
  "$CC_DIR/docs/infrastructure" \
  "$CC_DIR/docs/patterns" \
  "$CC_DIR/docs/runbooks" \
  "$CC_DIR/daily" \
  "$CC_DIR/todos" \
  "$CC_DIR/missions" \
  "$CC_DIR/agents-md"
ok "Data directory ready"

# ─── 2. SQLite database ───────────────────────────────────────────────────────

log "Initializing SQLite database"
DB_PATH="$CC_DIR/mc.db"

if [ ! -f "$DB_PATH" ]; then
  # Run Drizzle migrations from the app directory
  APP_DIR="$REPO_DIR/app"
  if [ -d "$APP_DIR/node_modules" ]; then
    cd "$APP_DIR"
    npx drizzle-kit push 2>/dev/null && ok "Database initialized" || warn "Drizzle push failed — DB will be created on first run"
    cd -
  else
    warn "App deps not installed. Run 'npm install' in $APP_DIR then re-run installer."
  fi
else
  ok "Database already exists — skipping"
fi

# ─── 3. Cursor rules & agents ────────────────────────────────────────────────

log "Installing Cursor rules and agent"
RULES_SRC="$REPO_DIR/cursor/rules"
AGENTS_SRC="$REPO_DIR/cursor/agents"
SKILLS_SRC="$REPO_DIR/cursor/skills"

RULES_DEST="$CURSOR_DIR/rules"
AGENTS_DEST="$CURSOR_DIR/agents"

mkdir -p "$RULES_DEST" "$AGENTS_DEST"

if [ -d "$RULES_SRC" ]; then
  cp -r "$RULES_SRC/"* "$RULES_DEST/" 2>/dev/null || true
  ok "Cursor rules installed → $RULES_DEST"
fi

if [ -d "$AGENTS_SRC" ]; then
  cp -r "$AGENTS_SRC/"* "$AGENTS_DEST/" 2>/dev/null || true
  ok "Lucius agent installed → $AGENTS_DEST"
fi

# ─── 4. start.sh ─────────────────────────────────────────────────────────────

START_SCRIPT="$CC_DIR/start.sh"
cat > "$START_SCRIPT" << 'EOF'
#!/usr/bin/env bash
APP_DIR="$(dirname "$(dirname "$(realpath "$0")")")/Projects/mission-control/app"

# Try to find the app directory
if [ ! -d "$APP_DIR" ]; then
  # Fallback: look for it relative to common locations
  for candidate in ~/Projects/mission-control/app ~/code/mission-control/app ~/dev/mission-control/app; do
    if [ -d "$candidate" ]; then
      APP_DIR="$candidate"
      break
    fi
  done
fi

if [ ! -d "$APP_DIR" ]; then
  echo "[cc] Could not find mission-control/app. Update start.sh with the correct path."
  exit 1
fi

cd "$APP_DIR"
echo "⚡ Starting Mission Control v2..."
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
npm run dev
EOF
chmod +x "$START_SCRIPT"
ok "start.sh created → $START_SCRIPT"

# ─── 5. Seed knowledge templates ─────────────────────────────────────────────

log "Writing knowledge doc templates"

if [ ! -f "$CC_DIR/docs/architecture/README.md" ]; then
cat > "$CC_DIR/docs/architecture/README.md" << 'EOF'
# Architecture Docs

Store architecture decisions, system diagrams, service maps here.

## Files
- `overview.md` — high-level system diagram
- `services.md` — service inventory and responsibilities
- `adrs/` — architecture decision records
EOF
ok "Architecture template written"
fi

if [ ! -f "$CC_DIR/docs/runbooks/README.md" ]; then
cat > "$CC_DIR/docs/runbooks/README.md" << 'EOF'
# Runbooks

Operational knowledge: how to connect, debug, deploy.

## Format
Each runbook: one markdown file per topic.
- `db-connect.md` — how to connect to each database
- `deploy.md` — deployment procedure
- `incidents.md` — past incidents and resolutions
EOF
ok "Runbooks template written"
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "  ✅ Mission Control v2 installed!"
echo ""
echo "  Start the dashboard:   ~/.mission-control/start.sh"
echo "  Or from the repo:      cd $REPO_DIR/app && npm run dev"
echo "  Dashboard URL:         http://localhost:3000"
echo ""
echo "  @lu is ready in Cursor. Open any project and type @lu"
echo ""
