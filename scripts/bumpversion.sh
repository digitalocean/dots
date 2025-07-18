#!/usr/bin/env bash

set -euo pipefail

ORIGIN=${ORIGIN:-origin}

# Bump defaults to patch. We provide friendly aliases
# for patch, minor and major
BUMP=${BUMP:-patch}

# Get current version from package.json
current_version=$(node -p "require('./package.json').version")
IFS='.' read -r major minor patch <<< "$current_version"

case "$BUMP" in
  feature | minor)
    minor=$((minor + 1))
    patch=0
    ;;
  breaking | major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  *)
    patch=$((patch + 1))
    ;;
esac

if [[ $(git status --porcelain) != "" ]]; then
  echo "Error: repo is dirty. Run git status, clean repo and try again."
  exit 1
elif [[ $(git status --porcelain -b | grep -e "ahead" -e "behind") != "" ]]; then
  echo "Error: repo has unpushed commits. Bumping the version should not include other changes."
  exit 1
fi  

new_version="$major.$minor.$patch"
npm version "${new_version}" --no-git-tag-version

echo "Version bumped to $new_version"
