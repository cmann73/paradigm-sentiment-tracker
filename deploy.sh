#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Paradigm Sentiment Tracker — Centaur Deploy Script
# Run this once from your terminal to push the app live.
# ─────────────────────────────────────────────────────────────
set -e

CENTAUR_API_KEY="${CENTAUR_API_KEY:-}"
APP_NAME="paradigm-sentiment-tracker"
PORT=3000

# ── 1. Check for API key ──────────────────────────────────────
if [ -z "$CENTAUR_API_KEY" ]; then
  echo ""
  echo "Enter your Centaur API key (aiv2_...):"
  read -r CENTAUR_API_KEY
fi

echo ""
echo "▶ Checking Centaur connection..."
HEALTH=$(curl -s https://svc-ai.dayno.xyz/health -H "X-Api-Key: $CENTAUR_API_KEY")
if echo "$HEALTH" | grep -q '"ok"'; then
  echo "✓ Connected to Centaur"
else
  echo "✗ Could not connect. Check your API key and try again."
  echo "  Response: $HEALTH"
  exit 1
fi

# ── 2. Check for gh CLI ───────────────────────────────────────
if ! command -v gh &> /dev/null; then
  echo ""
  echo "⚠ GitHub CLI (gh) not found."
  echo "  Install it from https://cli.github.com then run this script again."
  exit 1
fi

# ── 3. Create GitHub repo and push ───────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "▶ Setting up GitHub repo..."

if ! git rev-parse --git-dir > /dev/null 2>&1; then
  git init
  git add .
  git commit -m "Initial commit: Paradigm Sentiment Tracker"
fi

# Create private repo if it doesn't exist
if gh repo view "$APP_NAME" > /dev/null 2>&1; then
  echo "✓ Repo already exists"
  REPO_URL=$(gh repo view "$APP_NAME" --json url -q .url)
else
  echo "▶ Creating private GitHub repo: $APP_NAME..."
  gh repo create "$APP_NAME" --private --source=. --push
  REPO_URL=$(gh repo view "$APP_NAME" --json url -q .url)
  echo "✓ Repo created: $REPO_URL"
fi

# Push latest changes
git add . && git commit -m "Deploy update $(date +%Y-%m-%d)" --allow-empty
git push -u origin main 2>/dev/null || git push -u origin master 2>/dev/null || true
echo "✓ Code pushed to GitHub"

# ── 4. Deploy to Centaur ──────────────────────────────────────
echo ""
echo "▶ Deploying to Centaur..."

DEPLOY_RESPONSE=$(curl -s -X POST https://svc-ai.dayno.xyz/apps \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $CENTAUR_API_KEY" \
  -d "{
    \"name\": \"$APP_NAME\",
    \"repo_url\": \"${REPO_URL}.git\",
    \"port\": $PORT,
    \"env\": {
      \"CENTAUR_API_URL\": \"http://api:8000\",
      \"CENTAUR_API_KEY\": \"\"
    }
  }")

echo "$DEPLOY_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$DEPLOY_RESPONSE"

if echo "$DEPLOY_RESPONSE" | grep -q '"name"'; then
  echo ""
  echo "✓ Deployed! Your app will be live at:"
  echo ""
  echo "  https://${APP_NAME}.svc-ai.dayno.xyz"
  echo ""
  echo "  (It may take 1-2 minutes to finish building)"
else
  echo ""
  echo "⚠ Deployment may have encountered an issue. Check the response above."
fi

# ── 5. Monitor build ──────────────────────────────────────────
echo "▶ Checking build status..."
sleep 10
STATUS=$(curl -s "https://svc-ai.dayno.xyz/apps/$APP_NAME" \
  -H "X-Api-Key: $CENTAUR_API_KEY")
echo "$STATUS" | python3 -m json.tool 2>/dev/null || echo "$STATUS"
