<p>
  <img src="https://raw.githubusercontent.com/nicobailon/pi-subagents/main/banner.png" alt="pi-subagents" width="1100">
</p>

# pi-subagents — 维护 fork

[English](README.md) | 中文

`pi-subagents` 让一个 Pi 会话可以在受控权限、可见进度、监督和持久证据下，把工作委派给多个子 Agent。

本仓库是维护中的 fork：

<https://github.com/chenhaoxiang/pi-subagents>

当前 fork 版本为 `0.76.1-fork.3`，基于社区 Pi Subagents `v0.76.1`，并包含截至 `d7ac44bd` 的已审查上游 `main` 修复。fork 专属行为继续保留在 fork 的 `main` 上。

## 发布版本与分支约定

当前维护版本为 **0.76.1-fork.3**，基于社区 **0.76.1**。fork 版本统一使用 `<社区版本>-fork.<修订号>`，本地修订不冒充社区新版本。

- `main`：我们的维护、整合与发布主线，保留 fork 修复。
- `upstream-main`：仅镜像社区 `main`，不加入 fork 提交，也不作为安装来源。
- 改动通过经过审核的 PR 合入 `main`；保留现有分支和历史。

固定版本安装：

```bash
pi install git:github.com/chenhaoxiang/pi-subagents@v0.76.1-fork.3
```

[GitHub Releases](https://github.com/chenhaoxiang/pi-subagents/releases) 提供可安装的包、来源清单和 `SHA256SUMS` 校验文件；这不是向上游作者的 npm 命名空间发布。发布及制品安装流程见[维护说明](docs/releasing.md)。

## 安装本 fork

需要 fork 行为时，不要安装社区 npm 包，请安装本仓库：

```bash
pi install git:github.com/chenhaoxiang/pi-subagents@main
```

可复现环境使用上面的固定发布 tag。Release 额外提供**编译后的安装包**，包含 `index.js`、API 导出和 runner 文件，不仅是源码归档。下载包、来源清单及校验文件，校验后解压到永久目录，再 `pi install /absolute/path/to/package`；详见[维护说明](docs/releasing.md)。

安装后请**重启 Pi**加载新运行时。0.76.1 会检测原地更新；旧模块尚在内存时可能拒绝 `/reload`，必须重启以免混用新旧代码。安装过程不会强制停止活跃会话或子任务。

## Fork 专属能力

fork 保留社区 `0.76.1` 能力，并额外维护：

- **受保护的异构模型 fallback**：只有在子 Agent 尚未产生工具副作用前发生 provider/model 失败时，才推进显式 fallback 链或内置模型池；每次尝试都会保留为证据；
- **基于活动的 `idleTimeoutMs`**：前台和后台子 Agent 的流式输出及工具生命周期活动会续期；它不是墙钟总时长上限；
- **Runner 与 Pi 1.x 兼容**：对长期运行的父会话和不同宿主布局提供兼容，并对未知或旧布局 fail closed；
- **原生子 Agent 命令监督**：获得 `bash` 和 `subagent_command` 的子 Agent 可被检查、暂停等待或取消命令，命令不会从父会话中消失；
- **维护中的后台执行、工作流恢复、模型 scope、子扩展要求和 Pi 1.0 clean-install 兼容**。

fork 不会在工具副作用之后静默重放子 Agent。Provider/model fallback 有意比通用任务重试更严格。

## 用自然语言开始

不需要先创建 Agent 文件：

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

委派仍需要用户授权或适用的项目指令；仅仅因为任务复杂，不会自动获得委派授权。

## 内置 Agent

| Agent | 适用场景 |
| --- | --- |
| `scout` | 快速摸清仓库、入口、数据流和风险； |
| `researcher` | 带来源进行网页或文档研究； |
| `evidence-auditor` | 检查重要研究结论是否有证据支持； |
| `worker` | 在边界内实施代码，并在需要时升级问题； |
| `reviewer` | 审查 diff、回归风险、测试和复杂度； |
| `oracle` | 在行动前提供只读的挑战性意见； |
| `delegate` | 接近父会话行为的轻量通用委派。 |

## 执行模式

扩展支持：

- 在父会话中流式显示的前台子会话；
- 带持久状态和结果 artifact 的后台/异步运行；
- 顺序 chain、静态 parallel、动态 fan-out 和保存的 workflow；
- 用于隔离实现的托管 worktree；
- mission、schedule、验收证据、结构化输出和有界结果持久化；
- 在契约明确时使用外部 runner 或指定机器执行。

支持动态添加工具的宿主，会先显示紧凑的 `subagents_enable` loader，下一次请求才提供完整 `subagent` schema；如果修改工具列表会破坏 prompt cache，则新会话直接提供 `subagent`。`bg_wait` 和 supervisor 回复无需等待工具激活。

## 可见性与控制

可以使用自然语言或 slash 命令：

```text
/subagents-fleet
/subagents-doctor
/subagents-guide workflows
```

Fleet 视图展示活跃子任务、嵌套工作、artifact、需要关注的请求和控制项。后台运行不应变得不可见：可以查看状态、回复 supervisor 请求、steer 或显式停止运行。

重要边界：

- `timeoutMs` / `maxRuntimeMs` 是硬总时长限制；
- `idleTimeoutMs` 只按无活动时间计时，真实流式/工具活动会续期；
- `bg_wait` 等待指定后台运行，不能替代普通的可见监督；
- acceptance、gate 和 output artifact 是证据契约，不是乐观的成功字符串。

## 配置与文档

安装后的配置从 Pi 正常的 settings 和项目文件读取。详细文档位于 `docs/`：

| 文档 | 内容 |
| --- | --- |
| [Agents](docs/agents.md) | Agent 文件、frontmatter、工具、扩展和 skills； |
| [Models](docs/models.md) | 模型选择、fallback 链、思考级别、scope 和 profile； |
| [Workflows](docs/workflows.md) | chain、parallel、fan-out、worktree 和恢复； |
| [Watchdog](docs/watchdog.md) | 可选的对抗式变更审查和范围监控； |
| [Tool reference](docs/tool-reference.md) | `subagent`、管理、状态、控制、gate 和 runner； |
| [Observability](docs/observability.md) | FleetView、artifact、事件、日志和会话共享； |
| [Missions](docs/missions.md) | 持久 mission、schedule、receipt 和恢复； |
| [Configuration](docs/configuration.md) | `config.json` 和环境变量； |
| [Extension API](docs/extension-api.md) | RPC、委派 API、preflight 和可信 workflow resource； |
| [Standalone execution](docs/standalone-background.md) | npm runner 与 Pi standalone 兼容边界。 |

## 开发与测试

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build:pkg
npm run test:unit
npm run test:integration
npm run test:smoke:tool-activation
```

仓库 CI 还会针对受支持的 Pi 宿主版本运行 clean-install 检查。测试套件不需要 provider 凭据，也不会启动真实生产会话。

## 上游同步

社区源码通过只读 `upstream` remote 获取。Fork 改动经过审查后合入维护主线，fork 的 `main` 是安装来源。当 fork 专属行为仍然需要时，不要用纯社区树覆盖 fork 的 `main`。

## 许可证

MIT
