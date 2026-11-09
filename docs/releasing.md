---
doc_type: runbook
project: workspace
status: active
truth_mode: maintained
created: 2026-10-06
verified: 2026-11-09
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

The current source candidate is **0.86.0-fork.9**, based on community version **0.86.0** through `fd6d45b31bcc2412d3aca9f4230be979e95b0a96`. It retains mission/schema-2, provider-identity and parent-scoped shutdown repairs. Durable wait ownership is selectively ported from published v0.87.0 (`7f9c0af5c0a5f02c6b12c56cf2ebe61c3f4a8318`), with a strict record-v2 fence, unknown/corrupt claimant hold, exclusive proven-dead takeover and batched cleanup; this is not a full community-version upgrade. New registrations require native process ownership. Supporting readers do not restore, deliver, migrate or prune legacy v1 waits, which an old runtime may already hold. Previous published **0.86.0-fork.8** remains available but cannot consume pending v2 waits; rollback does not downgrade them. Inspect exact run status and explicitly re-arm only a needed authorized notification, never the underlying task. Mission schema-2 compatibility is separate and unchanged. See [waitTool](configuration.md#waittool) and [missions](missions.md). Guarded fallback, idle timeout, runner/host compatibility, native-child evidence, ordinary native completion and unknown-run recovery remain. Exact publication, fresh-download and installed-source acceptance belong to the immutable Release; source metadata is not proof of active-session loading. No real-store migration or forced session reload is part of publication.

## Publish every version

1. Fetch origin/main and create an isolated worktree from the latest remote integration branch. Keep all pre-existing dirty work untouched.
2. Merge only reviewed community changes when needed; resolve conflicts without discarding fork fixes. Update package version, lockfile metadata (when present), and both README files.
3. Run typecheck, `npm run build:pkg`, targeted fork/package/peer-loader/background-wait regressions and tool-activation smoke. Required GitHub CI must pass: Linux/Windows unit/integration shards, official standalone, Bun workflow, nested-wait, loader capability and clean installs. Distinguish those results from any unrun full local macOS suite; do not claim all local platform tests passed. Review the exact diff and required CI.
4. Merge the PR normally, then verify the remote main contains the validated head.
5. At that exact main commit, run `npm run build:pkg` then `npm pack ./dist-pkg --ignore-scripts --pack-destination tmp/release`. Package only compiled dist-pkg; the source manifest remains private. Inspect/extract the tarball and smoke-load it in an isolated Pi agent directory without model requests.
6. Write `release-manifest.json` with repository, version, exact source commit, community base, mirror tip, package filename and SHA-256. Generate `SHA256SUMS` for both the tarball and manifest.
7. Create a GitHub Release with `gh release create v<version> --target <exact-main-sha> --latest`, attaching the tarball, manifest and checksums. Never run `npm publish` against the upstream author's package.
8. Download the published assets afresh, verify `shasum -a 256 -c SHA256SUMS`, and smoke-load the downloaded package. Record the PR, tests and installation limitations in release notes.

## Installation

See [upgrade evidence and installation boundaries](maintenance/2026-10-17-community-0.79.0.md) for the current source, release and installed-acceptance record.

Prefer the pinned git command in README. For offline/artifact installs, download the three release assets into a temporary directory, verify the checksums, then extract the package into a permanent user-owned package directory and run `pi install /absolute/path/to/package`. Do not leave an active install under a temporary release directory. Restart Pi after this upgrade. The 0.77.0 update detector rejects reload when imported modules belong to an old in-place version; disk updates do not replace loaded code. Let active work finish before restarting.

Keep the previous release/source available for rollback. Never force-stop unrelated active children or silently replace a custom experimental installed package.

## 中文摘要

`main` 是保留我们修复的维护主线，`upstream-main` 只镜像社区主分支。版本使用社区基线加 `-fork.N`，每次通过测试的版本都发布固定 tag、GitHub Release、可安装包、来源清单和 SHA-256 校验文件。社区镜像领先不代表该新功能已进入本次发布；不能用纯社区树覆盖我们的修复。安装后需重启或 reload，已有会话不会自动切换。
