# AGENTS.md

Agents working in this repository must read [VISION.md](VISION.md) before making product, architecture, scope, or backlog-disposition decisions.
VISION.md is the acceptance policy for this project: use it to judge whether a proposed change, issue, or PR fits.
This file intentionally does not duplicate user-global or tool-level instructions.

## Documentation map

- [Standalone background execution](docs/standalone-background.md) documents npm runner peer aliasing, host resolution, and startup compatibility across package updates.

## Fork synchronization

This repository is a fork of `nicobailon/pi-subagents`.

- `main` is the community-sync line. It tracks `upstream/main`; do not develop fork-specific behavior directly on it.
- `origin/main` is updated from `upstream/main` only after the sync result is reviewed. The local branch is configured with `remote=upstream` and `pushRemote=origin`, so pulling and publishing the fork mirror are separate explicit actions.
- Fork-specific changes live on new branches based on the synchronized `main`, using names such as `feat/<topic>-YYYYMMDD` or `fix/<topic>-YYYYMMDD`.
- Before rebasing or replaying fork work, preserve the pre-sync fork tip in a `preserve/` branch and keep the original worktree intact until the new branch passes its checks.
- When upstream and fork work overlap, resolve the conflict on the new branch; do not force local fork commits back into the synchronization line.
