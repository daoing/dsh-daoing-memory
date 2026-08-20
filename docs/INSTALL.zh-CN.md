# 安装 dsh-daoing-memory

[English →](./INSTALL.md)

本指南覆盖**两种 DSH 环境**（官方命令安装的 DSH、源码启动的 DSH）与**两种安装渠道**（npm 包名、git/GitHub 地址），以及卸载与 skill 放置。

> **一句话版** —— `dsh plugin --profile web add <来源>`，然后放置 skill，再重启 DSH。

---

## 前置条件

- 一套可用的 DSH。二选一：
  - **官方安装** —— 你用官方命令启动 DSH，它替你管理 profile；或
  - **源码启动** —— 你克隆了 DSH monorepo 并从源码运行。
- `PATH` 里有 `pnpm`（`dsh plugin` 命令本质是对 pnpm 的轻量转发）。
- 一个要装入的 profile。网页端用 **`web`** profile；若你用别的 profile，请替换名称。

本插件把 `@deepseek-ai/*` 框架包声明为 **peer 依赖**。你无需自行安装它们——它们由你所装入的 DSH 提供。本包**自带预构建产物**（`lib/`），因此安装过程**不执行任何构建**。

## 两种安装渠道

### 渠道 A —— 从 npm（按包名）

```sh
dsh plugin --profile web add dsh-daoing-memory
```

从 npm registry 解析该包。包发布后即可这样装。

### 渠道 B —— 从 GitHub（按地址）

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

等价写法也可：`git+https://github.com/daoing/dsh-daoing-memory.git`，可用 `#<分支|标签|提交>` 固定版本。

由于本包自带预构建 `lib/`、且**不声明任何安装期构建脚本**，git 安装无需编译任何东西——pnpm 直接把文件落盘。（许多 git 托管的 DSH 插件靠 `prepare` 脚本在安装时构建，于是需要在 profile 的 `pnpm-workspace.yaml` 里加 `allowBuilds` 条目；本包刻意规避了这一摩擦。）

## 环境一 —— 官方命令安装的 DSH

最常见的情形：你用官方命令装了 DSH 并运行网页端。

**安装**

```sh
dsh plugin --profile web add dsh-daoing-memory        # 从 npm
# 或
dsh plugin --profile web add github:daoing/dsh-daoing-memory   # 从 GitHub
```

CLI 会把包加入 `web` profile；因为本包声明了 `dsh.bundle.patch`，它会被自动追加进 profile 的 bundle 栈（`dsh.profile.bundles`）。无需手动接线。

**放置提炼 skill**

```sh
node node_modules/dsh-daoing-memory/scripts/install-skill.mjs
```

这会把 `skill/memory-extraction.md` 拷贝进你的 skill 目录（`$DSH_HOME/skills`，未设 `DSH_HOME` 时退回 `~/.dsh/skills`）。它绝不覆盖已有文件；加 `--force` 才会替换。你也可以手动拷贝该文件——任何 DSH 会扫描的 skill 目录都行。

**重启 DSH。** 记忆工具、画像快照注入、Memory 工作台都会在下次启动时生效。

**卸载**

```sh
# 可选：先移除 skill
rm "$DSH_HOME/skills/memory-extraction.md"      # 或 ~/.dsh/skills/...
dsh plugin --profile web remove dsh-daoing-memory
```

移除包的同时，其对应行也会自动从 profile bundle 栈中移除。你已积累的记忆（DSH 存储目录下的 SQLite 数据库）**不会**因卸载被删除——想清空请看 FAQ。

## 环境二 —— 源码启动的 DSH

你克隆了 DSH monorepo 并从源码运行（例如用 CLI 的 `web` 命令 + 自定义 `DSH_HOME`）。

**安装** —— 同一条 `dsh plugin` 命令作用于你的源码 profile：

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

> **关于内置 memory 行。** 源码 monorepo 的 base bundle 已内置 memory 行（`id: memory`、`id: memory-tools`）。profile patch 采用*按行 id 后写覆盖*，因此安装 `dsh-daoing-memory` 会把这些已有行**重新指向** `dsh-daoing-memory` 实现，而不是新增一份。如果你想并行对比，可在本地 `cordis.patch.yml` 里给行改名。

如果你是在*开发*本插件、想要源码级实时迭代，可以改用路径安装本地检出：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-daoing-memory
```

（深度 monorepo 开发时你可能更愿意把包留在 DSH workspace 内；见 `docs/BUILDING.zh-CN.md`。）

**放置 skill** 与 **重启** 同环境一。

**卸载**

```sh
dsh plugin --profile web remove dsh-daoing-memory
```

## 安装校验

重启 DSH 后：

1. **工具** —— 会话里 agent 能调用 `memory_fact`、`memory_extract`、`memory_recall` 等。让它“记一条日记”，看是否成功。
2. **画像注入** —— 一旦有了事实/关心事项，系统提示词里会出现一段精简的记忆/画像。
3. **工作台** —— 网页侧边栏出现 **Memory** 分区（事实日记 / 经验 / 账本 / 人工运维）。
4. **数据库** —— 首次写入后，DSH 存储目录下出现 `memory.db`。

若 Memory 分区缺失，多半是插件没进 bundle 栈——见“故障排查”。

## 故障排查

- **`dsh plugin` 提示该包“未声明 dsh.bundle”** —— 你装的不对（或装到了陈旧构建）。确认装的是 `dsh-daoing-memory`，且其 `package.json` 声明了 `dsh.bundle.patch`。
- **重启后没有 Memory 分区** —— 检查 profile 的 bundle 列表是否包含 `dsh-daoing-memory`（CLI 安装时会自动对齐）。完整重启 DSH。
- **源码检出里的行冲突** —— 安装会把内置 `memory` 行重新指向（这是设计使然）。见环境二的说明。
- **别的 git 插件要求 `allowBuilds`** —— 那个插件在安装时构建；把 pnpm 打印的键加进 profile 的 `pnpm-workspace.yaml`。本包不需要。
- **skill 没生效** —— 确认 `memory-extraction.md` 已落到 DSH 扫描的 skill 目录（`$DSH_HOME/skills`），然后重启。

另见 [FAQ.zh-CN.md](./FAQ.zh-CN.md)、[BUILDING.zh-CN.md](./BUILDING.zh-CN.md) 与 [MIGRATION.zh-CN.md](./MIGRATION.zh-CN.md)（数据存放与迁移）。
