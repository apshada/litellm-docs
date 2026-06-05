# Docs versioning

This directory contains the tooling that backfills **Docusaurus versioned docs**
for LiteLLM, so users can read the documentation as it existed for the specific
`litellm` pip version they have installed.

- Check your version: `litellm --version` (or `pip show litellm`).
- Browse all versions: **/versions**.
- The newest release is served at `/docs/`; the unversioned working tree (`docs/`)
  is published as **main** at `/docs/main/` with an "unreleased" banner; older
  versions show an "unmaintained" banner.

## What gets versioned

- **Range:** every *final* `X.Y.Z` pip release from `1.79.0` (2025-10-26) through
  the latest stable (`floor_version` in `manifest.json`). Pre-releases
  (`.devN`, `rcN`, `postN`) are excluded — they are not `pip install` targets in
  production.
- **Scope:** the entire `docs/` tree. `release_notes/` and `blog/` are
  intentionally **not** versioned — they are already chronological.

## Build & hosting architecture (important)

Docusaurus re-renders **every** version on **every** build, but the 73 backfilled
snapshots are *frozen* — they never change. Rebuilding them on every PR makes the
merge-gating build blow past Vercel's 45-minute limit. So the build is split:

| Build | What it renders | Where | Speed |
| --- | --- | --- | --- |
| **Vercel** (every PR + production) | **current docs only** | docs.litellm.ai | fast (~minutes) |
| **CI archive** (`.github/workflows/build-docs-archive.yml`) | **all versions** | GitHub Pages (or custom domain) | slow, but off the merge path & no 45-min cap |

This is controlled by `DOCS_VERSIONS_BUILD_LIMIT` (read in `docusaurus.config.js`):

- `current` **(default)** — current docs only. This is what Vercel runs.
- `all` — every version. This is what the CI archive workflow runs.
- `<N>` — current + the latest N released versions (e.g. `20`).

The live site's version dropdown and `/versions` page link frozen versions to the
archive via **`DOCS_ARCHIVE_URL`**.

### One-time setup

1. **Enable GitHub Pages** for this repo (Settings → Pages → Source: GitHub
   Actions). The workflow `build-docs-archive.yml` deploys there. It builds with
   `DOCS_SITE_URL=https://<owner>.github.io` and `DOCS_BASE_URL=/<repo>/`; for a
   custom domain (e.g. `archive.docs.litellm.ai`) set those to the domain with
   `DOCS_BASE_URL=/` instead.
2. **On Vercel**, set env var `DOCS_ARCHIVE_URL` to the archive's base URL
   (e.g. `https://berriai.github.io/litellm-docs`). The default Vercel build stays
   `current`-only — no other change needed.
3. *(Optional)* To keep old-version URLs on `docs.litellm.ai`, add a Vercel
   rewrite proxying `/docs/:v(\d+\.\d+\.\d+)/:path*` to the archive host instead
   of linking cross-origin.

The archive is **noindexed** (`DOCS_ARCHIVE_BUILD=1` → `noIndex`) and its old
versions carry `canonical` links back to the live site, so it never competes with
docs.litellm.ai in search.

## How the version→commit mapping works (and its caveat)

This docs repo has **no release tags** (pip releases are tagged in `berriai/litellm`).
We map each release to a docs commit by **publish date**:

```
git rev-list -1 --before="<PyPI upload timestamp>" origin/main
```

i.e. the last `main` commit that existed when the release was published on PyPI.

> **Caveat — best effort.** Documentation edits that landed shortly *after* a
> release was cut are attributed to the *next* version. A snapshot therefore
> reflects "the docs as of the release date", not a tag-exact correspondence.
> Same-day releases may share a source commit. See `manifest.json` for the exact
> commit each version maps to.

## Files

| File | Purpose |
| --- | --- |
| `build_manifest.py` | Builds `manifest.json`: for each final release ≥ floor, resolves the source commit via the date mapping above. |
| `manifest.json` | Generated source of truth: `version`, `pypi_published`, `source_commit`, `source_commit_date`. |
| `generate_versions.sh` | Materializes each version's historical `docs/` + `sidebars.js` and runs `docusaurus docs:version` to snapshot it; then links sibling dirs, restores missing images, and sanitizes sidebars. |
| `link_escaping_siblings.py` | Symlinks repo-root siblings (img/src/static) into `versioned_docs/` so relative refs that escape the docs tree resolve across versions. |
| `fill_missing_images.py` | Restores images referenced by old snapshots but since removed from `img/`. |
| `sanitize_sidebars.py` | Removes versioned-sidebar references to doc ids absent from a snapshot (transient historical states). |
| `graceful-fs-preload.js` | Preloaded via `NODE_OPTIONS` in the build script; bounds concurrent file ops so many-version builds don't hit EMFILE on low-ulimit hosts. |

## Regenerating (reproducible)

```bash
# 1. Refresh the manifest from PyPI + git history (needs full history of origin/main).
git fetch --unshallow origin main   # if the clone is shallow
python3 versioning/build_manifest.py

# 2. Regenerate all versioned_docs / versioned_sidebars / versions.json from scratch.
versioning/generate_versions.sh --reset

# 3. Validate the full archive build locally (needs ~12GB heap).
DOCS_VERSIONS_BUILD_LIMIT=all NODE_OPTIONS="--require ./versioning/graceful-fs-preload.js --max-old-space-size=12288" npm run build
```

`generate_versions.sh --reset` is idempotent: a clean re-run reproduces an
identical `versioned_docs/` tree, `versioned_sidebars/`, and `versions.json`.
Git stores the snapshot blobs once (they are identical to existing history), so
committing them adds negligible pack size despite the large working tree.

To regenerate only a subset (e.g. for a quick build check):

```bash
versioning/generate_versions.sh --reset --only "1.79.0 1.85.0 1.87.1"
```

## Adding a version for a new release (going forward)

Automation is intentionally deferred. After a new pip release, either re-run the
full regeneration above, or add just the new version:

```bash
# map + snapshot the single new release, then sanitize
python3 versioning/build_manifest.py
versioning/generate_versions.sh --only "<new-version>"
git add versions.json versioned_docs versioned_sidebars && git commit -m "docs: add version <new-version>"
```

Pushing to `main` triggers the CI archive workflow (it watches `versioned_docs/`
& `versions.json`), which rebuilds and republishes the archive. Vercel builds stay
fast because they never render the snapshots.
