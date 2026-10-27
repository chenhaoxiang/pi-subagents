# AGENTS.md

Agents working in this repository must read [VISION.md](VISION.md) before making product, architecture, scope, or backlog-disposition decisions.
VISION.md is the acceptance policy for this project: use it to judge whether a proposed change, issue, or PR fits.
This file intentionally does not duplicate user-global or tool-level instructions.

## Documentation map

- [0.83.0-fork.1 community synchronization](docs/maintenance/2026-10-28-community-0.83.0.md): exact main snapshot, retained fork behavior, validation and installed acceptance boundaries.

- [0.79.2-fork.1 community synchronization](docs/maintenance/2026-10-21-community-sync.md): exact main snapshot, retained fork behavior, validation and release/install boundaries.

- [Native-child run measurements](docs/maintenance/2026-10-20-async-measurements.md): existing metadata parity, run/session identity, unknown and unpriced semantics, safe artifact consumption and verification boundaries.

- [Parent wake provenance and convergence](docs/maintenance/2026-10-18-parent-wake-convergence.md): native custom turns on Pi 1.3+, retained legacy lifecycle/abort protection and synthetic regression evidence.

- [0.79.0-fork.1 synchronization](docs/maintenance/2026-10-17-community-0.79.0.md): exact community integration, retained fallback/idle/wait behavior, startup/resume/supervision fixes, validation and release/install boundaries.

- [0.78.0-fork.1 community synchronization](docs/maintenance/2026-10-14-community-0.78.0.md): exact upstream integration, retained fallback/idle/wait contracts, chord-less Pi 1.2 host support, successful CI with retained first-attempt failure, immutable release and installed-byte/RPC acceptance.

- [0.77.0-fork.1 installed acceptance](docs/maintenance/2026-10-11-installed-acceptance.md): immutable release download, installed byte readback, RPC smoke and restart boundary.

- [0.77.0-fork.1 community synchronization and installation](docs/maintenance/2026-10-11-community-0.77.0.md): exact upstream 0.77.0 integration, retained fork contracts, validation, immutable release and installed acceptance/restart boundaries.

- [0.76.1-fork.3 performance and reliability upgrade](docs/maintenance/2026-10-10-community-performance.md): historical exact upstream integration, retained fork contracts, reviewed source/CI, immutable release and installed acceptance/restart boundaries.

- [0.76.1-fork.2 installed acceptance](docs/maintenance/2026-10-08-pi-core-fork-installed.md): exact release/source, verified immutable install and no forced parent/child restart.

- [Pi core fork host compatibility](docs/maintenance/2026-10-07-pi-core-fork-host.md): strict stable-base fork recognition, retained fail-closed checks and immutable 0.76.1-fork.2 installation boundaries.

- [0.76.1 maintained upgrade](docs/maintenance/2026-10-06-community-0.76.1.md): community merge, retained installed model-pool repair, validation and installation/restart boundaries.

- [Standalone background execution](docs/standalone-background.md) documents npm runner peer aliasing, host resolution, and startup compatibility across package updates.
- [Background wait timeout contract](docs/configuration.md#waittool) documents the 60-minute unconfigured window, blocking-only call-level `timeoutMs`, and rejection of short non-blocking subscription/polling misuse. Regression coverage is in `test/unit/bg-wait-timeout-contract.test.ts`.

## Fork synchronization and releases

This repository is the maintained fork of `nicobailon/pi-subagents`.

- `main` is our integration/release branch and retains fork-specific behavior. Never replace it with the pure community tree. Use isolated topic branches, tested PRs and regular merges.
- `upstream-main` exactly mirrors community `main`, with no fork commits, docs or version bumps. The read-only upstream remote fetches only main and has push URL DISABLED.
- Retain existing repair branches, custom worktrees and old tips. Local experimental packages are not release/main evidence.
- Fork package versions are `<community-base>-fork.<revision>`; every release gets an immutable v-prefixed tag, compiled installable tarball, exact-source provenance and SHA-256 checksums. Never publish the source/private package or the upstream npm identity.
- `docs/releasing.md`: per-version publishing, packaging/README parity, required CI, provider-free loading, current community baseline and installation limitations.
