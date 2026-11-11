---
doc_type: runbook
project: workspace
status: active
truth_mode: maintained
created: 2026-10-06
verified: 2026-11-11
verified_by: manual
verification_scope: Candidate identity and release contract; publication and active-session loading require separate acceptance
---

# Release maintenance

Applies only to chenhaoxiang/pi-subagents. The community project remains [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents).

## Branch and version contract

- `main` integrates our fixes and is the GitHub default/release branch. Topic branches use pull requests and regular merges.
- `upstream-main` mirrors only the community `main` exactly; never add documentation, version bumps, merge commits, or fork fixes to that mirror. Existing historical branches are retained.
- The `upstream` remote fetches only `refs/heads/main` and has push URL `DISABLED`. Refresh the mirror with a normal fast-forward push; if it has diverged, stop and preserve both tips rather than force-pushing.
- Package version: `<community-base-version>-fork.<N>`; release tag: `v<package-version>`. N starts at 1 and increments for each fork release on the same community base. Never reuse tags or replace published assets.
- `-fork.N` identifies a maintained fork; GitHub Releases are marked stable/latest, not experimental prereleases. This does not change SemVer ordering in npm.

## Baseline for this release

The current source candidate is **0.88.0-fork.1**, integrating published community **v0.88.0** at `c99503aed6d6b20d2397a1767f7d60730efe3963` (annotated tag object `c84d4a817db9e6e49179ec202ba6c619322eb767`), a 21-commit/73-file delta from v0.87.0. It builds on maintained main `a3c1a4f8392aadb30de6f90370eebfea3fa64b24`, preserving the reviewed drain/setup-abort guard and all fork safety/identity/recovery seams. This maintained version does not adopt the new age-based automatic fork-copy deletion; existing artifact cleanup, 90-day resumable async-state retention and strict leases remain. Missing/unknown ownership never authorizes deleting a copy or replaying work. See the [source synchronization report](maintenance/2026-11-11-community-0.88.0.md).

The published installation/rollback baseline is **0.87.0-fork.1**, released at `a3c1a4f8392aadb30de6f90370eebfea3fa64b24`. Its immutable tag/assets, older releases and installation materials remain intact. The new candidate stays source-only until fresh independent review, normal PR merge and separate immutable publication. Wait-record v2 and mission schema 2 retain their existing mixed-version boundaries: older unsupported readers do not gain permission to consume/downgrade records, supporting readers leave legacy v1 waits alone, and no real store is migrated. Source, publication, fresh download, disk selection and active-session loading are separate; disk updates do not hot-load old consumers.

## Publish every version

1. Fetch origin/main and create an isolated worktree from the latest remote integration branch. Keep all pre-existing dirty work untouched.
2. Merge only reviewed community changes when needed; resolve conflicts without discarding fork fixes. Update package version, lockfile metadata (when present), and both README files.
3. Run typecheck, `npm run build:pkg`, targeted fork/package/peer-loader/background-wait regressions and tool-activation smoke. Required GitHub CI must pass: Linux/Windows unit/integration shards, official standalone, Bun workflow, nested-wait, loader capability and clean installs. Distinguish those results from any unrun full local macOS suite; do not claim all local platform tests passed. Review the exact diff and required CI.
4. Merge the PR normally, then verify the remote main contains the validated head.
5. At that exact main commit, run `npm run build:pkg` then `npm pack ./dist-pkg --ignore-scripts --pack-destination tmp/release`. Package only compiled dist-pkg; the source manifest remains private. Inspect/extract the tarball and smoke-load it in an isolated Pi agent directory without model requests.
6. Write `release-manifest.json` using `schemaVersion: 1`, the actual package GitHub `repository`, exact package `version`, `tag: "v<version>"`, the exact 40/64-hex `sourceCommit`, and top-level 64-hex `packageSha256` for the tarball bytes. A top-level `packageFilename` may name the asset. Keep community base and mirror tip. An existing nested `package` object may remain, but `package.sha256` must equal `packageSha256` and its filename/size must describe those same bytes; never substitute the manifest hash or a source archive hash. This keeps new assets directly consumable by existing release-provenance readers. Generate `SHA256SUMS` for both the tarball and manifest. Never rewrite older immutable manifests/assets to retrofit this contract.
7. Create a GitHub Release with `gh release create v<version> --target <exact-main-sha> --latest`, attaching the tarball, manifest and checksums. Never run `npm publish` against the upstream author's package.
8. Download the published assets afresh, verify `shasum -a 256 -c SHA256SUMS`, and smoke-load the downloaded package. Record the PR, tests and installation limitations in release notes.

## Installation

See [upgrade evidence and installation boundaries](maintenance/2026-10-17-community-0.79.0.md) for the current source, release and installed-acceptance record.

Prefer the pinned git command in README. For offline/artifact installs, download the three release assets into a temporary directory, verify the checksums, then extract the package into a permanent user-owned package directory and run `pi install /absolute/path/to/package`. Do not leave an active install under a temporary release directory. Restart Pi after this upgrade. The 0.77.0 update detector rejects reload when imported modules belong to an old in-place version; disk updates do not replace loaded code. Let active work finish before restarting.

Keep the previous release/source available for rollback. Never force-stop unrelated active children or silently replace a custom experimental installed package.

## 中文摘要

`main` 是保留我们修复的维护主线，`upstream-main` 只镜像社区主分支。版本使用社区基线加 `-fork.N`，每次通过测试的版本都发布固定 tag、GitHub Release、可安装包、来源清单和 SHA-256 校验文件。社区镜像领先不代表该新功能已进入本次发布；不能用纯社区树覆盖我们的修复。安装后需重启或 reload，已有会话不会自动切换。
