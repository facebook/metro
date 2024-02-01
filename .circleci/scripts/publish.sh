#!/bin/sh
# Copyright (c) Meta Platforms, Inc. and affiliates.
#
# This source code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# Reduce a semver tag name to a Metro's release branch naming convention, eg v0.1.2-alpha.3 -> 0.1.x
RELEASE_BRANCH=$(echo "$CIRCLE_TAG" | awk -F. '{print substr($1, 2) "." $2 ".x"}')

# Does a release branch contain this tag (hotfix workflow)
TAG_ON_RELEASE_BRANCH=$(git branch -a --contains "$CIRCLE_TAG" | grep -cFx "  remotes/origin/$RELEASE_BRANCH" || true)
echo "Tag is on release branch $RELEASE_BRANCH: $TAG_ON_RELEASE_BRANCH"

# Does main contain this tag (regular release workflow)
TAG_ON_MAIN=$(git branch -a --contains "$CIRCLE_TAG" | grep -cFx '  remotes/origin/main' || true)
echo "Tag is on main branch: $TAG_ON_MAIN"

if [ $TAG_ON_RELEASE_BRANCH -eq $TAG_ON_MAIN ]; then
    echo "Could not determine whether this tag is 'latest' or a hotfix. Aborting."
    exit 1
fi

NPM_TAG="latest"
# Use a tag name like "0.123-stable" as the dist-tag for a hotfix. This *must not* be valid semver.
[ "$TAG_ON_RELEASE_BRANCH" -eq 1 ] && NPM_TAG="${RELEASE_BRANCH%.x}-stable"
echo "Publishing with --tag=$NPM_TAG"

npm run publish --tag="$NPM_TAG"
