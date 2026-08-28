#!/bin/bash
# Update s:CMS core to latest version while preserving user content
# This script applies upstream changes directly, protecting your src/usr/ folder

set -e

UPSTREAM_BRANCH="main"

# Install site-specific packages listed in usr/scripts/local-packages.yml
# This file is preserved across updates (lives in usr/) and allows each custom
# implementation to declare its own npm dependencies that survive core updates.
install_local_packages() {
  echo "🔍 Checking for site-specific packages to install..."
  local FILE="usr/scripts/local-packages.yml"

  if [ ! -f "$FILE" ]; then
    echo "➡️  No $FILE found, skipping"
    return 0
  fi

  # Parse YAML list items: lines matching "  - package-name" or "- package-name"
  local PACKAGES
  PACKAGES=$(grep -E '^[[:space:]]*-[[:space:]]+[^#]' "$FILE" \
    | sed 's/^[[:space:]]*-[[:space:]]*//' \
    | sed 's/[[:space:]]*#.*//' \
    | tr '\n' ' ' \
    | xargs)  # trim leading/trailing whitespace

  if [ -z "$PACKAGES" ]; then
    echo "➡️  No packages listed in $FILE, skipping"
    return 0
  fi

  echo "📦 Installing site-specific packages from $FILE..."
  echo "   Packages: $PACKAGES"
  # shellcheck disable=SC2086  # intentional word-splitting for package list
  npm install $PACKAGES
  echo "✓ Site-specific packages installed"
  echo ""
}

BACKUP_BRANCH="backup-before-update-$(date +%Y%m%d-%H%M%S)"

echo "🔄 s:CMS Core Update Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if upstream is configured
if ! git remote | grep -q "^upstream$"; then
  echo "❌ Upstream remote not configured."
  echo "Run: npm run setup-upstream"
  exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "⚠️  You have uncommitted changes."
  echo "Please commit or stash your changes before updating."
  echo ""
  git status --short
  exit 1
fi

# Create backup branch
echo "💾 Creating backup branch: $BACKUP_BRANCH"
git branch "$BACKUP_BRANCH"
echo "✓ Backup created (you can delete it later if update succeeds)"
echo ""

# Fetch latest changes
echo "📥 Fetching latest changes from upstream..."
git fetch upstream "$UPSTREAM_BRANCH"
echo ""

# Show what will be updated
echo "📋 Changes in this update:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
git --no-pager log HEAD..upstream/"$UPSTREAM_BRANCH" --oneline --graph --decorate --max-count=10
echo ""

# Ask for confirmation
read -p "Continue with update? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Update cancelled"
  git branch -d "$BACKUP_BRANCH" 2>/dev/null || true
  exit 0
fi

echo ""
echo "📂 Applying upstream files..."
echo "Note: Your usr/ folder will not be touched"
echo ""

# Snapshot your usr/ and .github/ contents before upstream checkout
TEMP_USR=$(mktemp -d)
if [ -d "usr/" ]; then
  cp -r usr/. "$TEMP_USR/"
fi

TEMP_GITHUB=$(mktemp -d)
if [ -d ".github/" ]; then
  cp -r .github/. "$TEMP_GITHUB/"
fi

# Checkout everything from upstream
git checkout upstream/"$UPSTREAM_BRANCH" -- .

# Wipe whatever upstream put in usr/ and restore your exact snapshot
rm -rf usr/
if [ "$(ls -A "$TEMP_USR" 2>/dev/null)" ]; then
  mkdir -p usr/
  cp -r "$TEMP_USR"/. usr/
  echo "✓ usr/ folder restored (upstream changes blocked)"
else
  echo "➡️  usr/ was empty, nothing to restore"
fi
rm -rf "$TEMP_USR"

# Restore .github/ by merging: start from user's snapshot, then overlay upstream on top
# This keeps user-defined workflows/deployments while letting upstream's copilot-instructions.md win
if [ "$(ls -A "$TEMP_GITHUB" 2>/dev/null)" ]; then
  cp -r "$TEMP_GITHUB"/. .github/
  git checkout upstream/"$UPSTREAM_BRANCH" -- .github/copilot-instructions.md 2>/dev/null || true
  echo "✓ .github/ folder restored (user files kept, upstream copilot-instructions.md applied)"
else
  echo "➡️  .github/ was empty, nothing to restore"
fi
rm -rf "$TEMP_GITHUB"

echo "✓ Core files updated"
echo ""

# Check for orphaned files (exist locally but no longer in upstream)
echo "🔍 Checking for orphaned files..."
TEMP_DIR=$(mktemp -d)
git ls-files | grep -v "^usr/" | grep -v "^\.github/" | sort > "$TEMP_DIR/local_files.txt"
git ls-tree -r --name-only upstream/"$UPSTREAM_BRANCH" | sort > "$TEMP_DIR/upstream_files.txt"

ORPHANED_FILES="$TEMP_DIR/orphaned_files.txt"
comm -23 "$TEMP_DIR/local_files.txt" "$TEMP_DIR/upstream_files.txt" > "$ORPHANED_FILES"

if [ -s "$ORPHANED_FILES" ]; then
  echo ""
  echo "⚠️  Found orphaned files (deleted upstream but still exist locally):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  cat "$ORPHANED_FILES" | sed 's/^/  • /'
  echo ""

  read -p "Remove orphaned files automatically? (y/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removing orphaned files..."
    while IFS= read -r file; do
      if [ -f "$file" ]; then
        git rm "$file" && echo "  ✓ Removed $file"
      fi
    done < "$ORPHANED_FILES"
    echo "✓ Orphaned files cleaned up"
    echo ""
  else
    echo "➡️  Orphaned files preserved (you can remove them manually later)"
    echo ""
  fi
fi

# Cleanup temp files
rm -rf "$TEMP_DIR"

# Commit the update
echo "💬 Committing update..."
git add -A
if git diff-index --quiet HEAD --; then
  echo "➡️  Nothing to commit, working tree clean"
else
  git commit -m "chore: update s:CMS core from upstream $(date +'%Y-%m-%d')"
  echo "✓ Committed"
fi
echo ""

# Check if package.json changed and reinstall dependencies
if git diff "$BACKUP_BRANCH" HEAD --name-only | grep -q "package.json"; then
  echo "📦 package.json was updated - installing dependencies..."
  npm install
  echo "✓ Dependencies installed"
  echo ""
fi

# Always reinstall site-specific packages (they are wiped when upstream package.json is applied)
install_local_packages

# If install_local_packages modified package.json or package-lock.json, offer to commit
git add -A
if ! git diff-index --quiet HEAD --; then
  echo "📝 package.json / package-lock.json changed after installing site-specific packages."
  read -p "Commit these changes? (y/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "chore: add site-specific packages $(date +'%Y-%m-%d')"
    echo "✓ Committed"
  else
    echo "➡️  Skipped commit — changes remain staged"
  fi
  echo ""
fi

# Push to origin
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Update complete!"
echo ""

read -p "📤 Push to origin? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git push origin HEAD
  echo "✓ Pushed to origin"
else
  echo "➡️  Skipped push — run manually: git push origin HEAD"
fi

echo ""
echo "Next steps:"
echo "  1. Review changes: git diff $BACKUP_BRANCH HEAD"
echo "  2. Test your site: npm run dev"
echo "  3. Delete backup branch: git branch -d $BACKUP_BRANCH"
echo ""