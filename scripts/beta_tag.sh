#!/usr/bin/env bash

set -eo pipefail

ORIGIN=${ORIGIN:-origin}

if [[ $(git status --porcelain) != "" ]]; then
  echo "Error: repo is dirty. Run git status, clean repo and try again."
  exit 1
elif [[ $(git status --porcelain -b | grep -e "ahead" -e "behind") != "" ]]; then
  echo "Error: repo has unpushed commits. Push commits to remote and try again."
  exit 1
fi

# Base version comes from package.json (strip any existing -beta.N suffix).
current_version=$(node -p "require('./package.json').version")
base_version=$(echo "$current_version" | sed -E 's/-beta\.[0-9]+$//')

if [[ ! "$base_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: package.json version '${current_version}' is not a supported base for beta tags."
  echo "Expected X.Y.Z or X.Y.Z-beta.N"
  exit 1
fi

# Ensure we see remote beta tags before choosing the next number.
git fetch --tags "$ORIGIN"

next_beta=1
existing=$(git tag -l "v${base_version}-beta.*" | grep -Eo '[0-9]+$' | sort -n | tail -1 || true)
if [[ -n "$existing" ]]; then
  next_beta=$((existing + 1))
fi

tag="v${base_version}-beta.${next_beta}"

if git rev-parse "$tag" >/dev/null 2>&1; then
  echo "Error: tag ${tag} already exists."
  exit 1
fi

git tag -m "beta release $tag" -a "$tag" $COMMIT && git push "$ORIGIN" tag "$tag"

echo ""
echo "Created and pushed beta tag: ${tag}"
echo "Customers can install with: npm i @digitalocean/dots@${tag#v}"
echo "Or track the beta channel:     npm i @digitalocean/dots@beta"
echo ""
