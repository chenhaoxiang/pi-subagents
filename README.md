<p>
  <img src="https://raw.githubusercontent.com/nicobailon/pi-subagents/main/banner.png" alt="pi-subagents" width="1100">
</p>

# pi-subagents — maintained fork

English | [中文](README.zh-CN.md)

`pi-subagents` lets one Pi session delegate focused work to child agents with bounded authority, visible progress, supervision, and durable evidence.

This repository is the maintained fork at:

<https://github.com/chenhaoxiang/pi-subagents>

It tracks the community project selectively and keeps fork-specific behavior on the fork's `main` line. The current fork release is `0.76.0-fork.2`, based on community Pi Subagents `v0.76.0` plus upstream `main` through `700c91bc`.

## Releases and branch policy

The maintained release is **0.76.0-fork.2**, based on community **0.76.0**. Fork releases use `<community-version>-fork.<revision>`; the fork revision increases without pretending to be a new upstream release.

- `main`: our maintained integration and release branch, including fork fixes.
- `upstream-main`: an exact mirror of the community's `main`, with no fork commits. Never install from this branch.
- Changes enter `main` through reviewed pull requests; existing branches and history are retained.

Install a reproducible release:

```bash
pi install git:github.com/chenhaoxiang/pi-subagents@v0.76.0-fork.2
```

[GitHub Releases](https://github.com/chenhaoxiang/pi-subagents/releases) include the installable package tarball, a provenance manifest, and `SHA256SUMS`. These GitHub releases are not npm publications under the upstream author's namespace. See [release maintenance](docs/releasing.md) for asset installation and future releases.

## Install this fork

Do not use the community npm package when you need the fork behavior. Install this repository instead:

```bash
pi install git:github.com/chenhaoxiang/pi-subagents@main
```

For reproducible environments, pin the released tag shown above. Releases also provide a **compiled** package (`index.js`, API exports and runner files), not only a source-code archive. Download the tarball, manifest and checksums, verify them, extract into a permanent directory and `pi install /absolute/path/to/package`; see [release maintenance](docs/releasing.md).

After installation, restart Pi or run `/reload`. Existing sessions do not hot-load the new extension code.

## Fork-specific behavior

The fork retains the community `0.76.0` functionality and adds or maintains:

- **Guarded heterogeneous model fallback** for native Pi children. Explicit fallback chains and the built-in pool advance only for provider/model failures that occur before child tool activity; each attempt remains visible as evidence.
- **Activity-based `idleTimeoutMs`** for foreground and background children. Stream and tool lifecycle activity resets the inactivity window; this is not a wall-clock runtime cap.
- **Runner and Pi 1.x compatibility** for long-lived parents and host layouts, with fail-closed handling for unknown or pre-1.0 layouts.
- **Command supervision** for native children that are granted `bash` and `subagent_command`: inspect, yield, or cancel the child command without hiding it from the parent.
- **Maintained background execution**, workflow recovery, model-scope handling, child-extension requirements, and Pi 1.0 clean-install compatibility from the synchronized community line.

The fork does not silently replay a child after tool side effects. Provider/model fallback is deliberately narrower than generic task retry.

## Try it in plain language

You do not need to create an agent file first:

```text
Use reviewer to review this diff.
```

```text
Ask oracle to challenge my plan before I implement it.
```

```text
Use scout to map the relevant code, then ask me only the questions that block implementation.
```

```text
Run parallel reviewers for correctness, tests, and unnecessary complexity.
```

Delegation still requires authorization from the user or applicable project instructions. Complexity alone is not authorization.

## Built-in agents

| Agent | Use it for |
| --- | --- |
| `scout` | Fast repository recon, entry points, data flow, and risks. |
| `researcher` | Web or documentation research with sources. |
| `evidence-auditor` | Checks whether important research claims are supported. |
| `worker` | Bounded implementation work with tests and escalation. |
| `reviewer` | Diff review, regression checks, and small fixes. |
| `oracle` | A read-only second opinion before acting. |
| `delegate` | A lightweight general delegate close to the parent session. |

## Execution modes

The extension supports:

- foreground child sessions that stream progress in the parent conversation;
- background and asynchronous runs with durable status and result artifacts;
- sequential chains, static parallel work, dynamic fan-out, and saved workflows;
- managed worktrees for isolated implementation;
- missions, schedules, acceptance evidence, structured output, and bounded result persistence;
- external runners and machine placement where their contracts are explicitly configured.

When the host can add tools dynamically, a fresh session starts with the compact `subagents_enable` loader and exposes the full `subagent` schema on the next request after activation. Other hosts start with `subagent` immediately when changing the tool list would break prompt caching. `bg_wait` and supervisor replies remain available without activation.

## Visibility and control

Use natural language or the slash commands:

```text
/subagents-fleet
/subagents-doctor
/subagents-guide workflows
```

The Fleet view exposes active children, nested work, artifacts, attention requests, and controls. A background run should never become invisible: inspect its status, reply to its supervisor request, steer it, or stop it explicitly.

Important boundaries:

- `timeoutMs` / `maxRuntimeMs` are hard runtime limits;
- `idleTimeoutMs` is inactivity-based and resets on meaningful stream/tool activity;
- `bg_wait` waits for a specific background run and does not replace ordinary user-visible supervision;
- acceptance, gates, and output artifacts are evidence contracts, not optimistic success strings.

## Configuration and documentation

Install-time configuration is read from the normal Pi settings and project files. The detailed reference lives in `docs/`:

| Document | Coverage |
| --- | --- |
| [Agents](docs/agents.md) | Agent files, frontmatter, tools, extensions, and skills. |
| [Models](docs/models.md) | Model selection, fallback chains, thinking levels, scopes, and profiles. |
| [Workflows](docs/workflows.md) | Chains, parallel work, fan-out, worktrees, and recovery. |
| [Watchdog](docs/watchdog.md) | Opt-in adversarial change review and scope monitoring. |
| [Tool reference](docs/tool-reference.md) | `subagent`, management, status, control, gates, and runners. |
| [Observability](docs/observability.md) | FleetView, artifacts, events, logs, and session sharing. |
| [Missions](docs/missions.md) | Durable mission records, schedules, receipts, and recovery. |
| [Configuration](docs/configuration.md) | `config.json` and environment variables. |
| [Extension API](docs/extension-api.md) | RPC, delegation API, preflight, and trusted workflow resources. |
| [Standalone execution](docs/standalone-background.md) | npm runner and Pi standalone compatibility boundaries. |

## Development and tests

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build:pkg
npm run test:unit
npm run test:integration
npm run test:smoke:tool-activation
```

The repository's CI also runs clean-install checks against supported Pi host versions. Provider credentials and real production sessions are not required for the test suite.

## Upstream synchronization

The community source is configured as a read-only `upstream` remote. Fork changes are reviewed and merged into the maintained fork line; the fork `main` is the installation source. Do not replace the fork `main` with a pure community tree when fork-specific behavior is still required.

## License

MIT
