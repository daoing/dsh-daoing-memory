# daoing-dsh-memory

> 面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的自进化记忆系统 —— 挣得式经验、日记/事实语义记忆、关心事项追踪，以及只增不删的审计账本。

[English →](./README.md)

没有记忆的 agent，每个会话都从零开始。`daoing-dsh-memory` 为 DSH agent 提供一套**持久、能自我进化**的记忆，而且这份记忆是靠*使用*一点点“挣”来的：它记日记、从中提炼关于用户的持久事实与未了心事、沉淀经过验证的经验、在需要时召回相关内容、发现错了就修订，并把每一次变更都记进可审计的账本。

整套设计围绕四个字 —— **生 · 用 · 修 · 记**。

---

## 为什么做

市面上大多数“记忆”方案，要么把原始对话一股脑灌进向量库，要么让模型随意往一个键值块里写东西。两者在实践中都会失败：前者让信号淹没在噪声里，后者让一次幻觉污染此后所有会话。

`daoing-dsh-memory` 采取了不同的立场：

- **记忆必须靠挣。** 一条经验以低信任的*候选*身份诞生，只有在真实使用中被反复证实后才晋升。没有任何东西能靠“钦定”直接获得高信任。
- **两种截然不同的记忆。** *语义记忆*（关于用户的持久事实 + 他们在意的未了心事）与*经验记忆*（带生命周期的 how-to 知识）分离，二者的写入、召回与治理方式各不相同。
- **每次写入都可审计。** 只增不删的账本记录每一次变更，记忆漂移或被投毒时可被察觉、可被归因、可被回滚。
- **人始终在回路中。** 浏览器工作台让你阅读、纠正、晋升、删除记忆——记忆是人机共享的资产，而非黑盒。

## 功能一览

| 模块 | 提供能力 |
| --- | --- |
| **日记（记）** | `memory_fact` —— 追加原始会话笔记，是一切提炼的原料。 |
| **提炼（生）** | `memory_extract` —— 把日记蒸馏成持久**事实**（9 类以用户为中心的类别，自动去重并累积佐证）与**关心事项**（todo / 思考 / 想法 / 问题 / 决定 / 承诺，均带背景场景）。 |
| **经验生命周期（生·用·修）** | `memory_ingest`、`memory_report`、`memory_revise`、`memory_refine`、`memory_verify` —— 经验以候选身份诞生，靠上报使用挣得信任，错了就修订，并能干净回滚。 |
| **召回（用）** | `memory_recall` —— 在共享经验库上做关键词/情境相关性匹配，支持可选的 context 范围限定。 |
| **审计** | `memory_ledger`、`memory_verify` —— 查询只增不删的账本并校验完整性。 |
| **整合** | `memory_consolidate` —— 周期性的压实与库内清理。 |
| **画像注入** | 把一份精简画像快照（头部事实 + 未了心事）注入系统提示词，让 agent *无需发问就了解用户*。 |
| **工作台 UI** | 浏览器面板（事实日记 / 经验 / 账本 / 人工运维），可手动检视与治理记忆。 |
| **提炼 skill** | 随包附带 `memory-extraction` skill，教会 agent *何时、如何*提炼出高质量记忆。 |

## 安装

支持两种 DSH 环境 —— **源码启动**的 DSH 与**官方命令安装**的 DSH；也支持两种安装渠道（npm 包名，或 git/GitHub 地址）。完整的安装/卸载/skill 放置矩阵见 **[docs/INSTALL.zh-CN.md](./docs/INSTALL.zh-CN.md)**。

官方安装版 DSH 的快速上手：

```sh
# 从 npm（发布后）
dsh plugin --profile web add daoing-dsh-memory

# 或直接从 GitHub
dsh plugin --profile web add github:daoing/daoing-dsh-memory

# 把提炼 skill 放到 DSH 加载 skill 的目录
node node_modules/daoing-dsh-memory/scripts/install-skill.mjs
```

然后重启 DSH。记忆工具即对 agent 可用，画像快照开始注入，网页侧边栏出现 **Memory** 分区。

## 使用

安装后，agent 获得一组 `memory_*` 工具。典型流程：

1. 会话进行中，agent 用 `memory_fact` 追加原始笔记。
2. 到自然停点，运行 `memory_extract` 提炼事实与关心事项（由 `memory-extraction` skill 引导）。
3. 之后的会话里，`memory_recall` 召回相关经验；系统提示词中已自带一份精简画像快照。
4. 某条经验被证实有用就 `memory_report`；发现错了就 `memory_revise`。
5. 你也可以在 **Memory** 工作台里手动检视与治理一切。

使用细节见 **[docs/INSTALL.zh-CN.md](./docs/INSTALL.zh-CN.md)**；当前已实现的范围见 **[docs/STATUS.zh-CN.md](./docs/STATUS.zh-CN.md)**。

## 设计

架构、信任/挣得模型、数据 schema、防投毒边界，见 **[docs/DESIGN.zh-CN.md](./docs/DESIGN.zh-CN.md)**。实现现状与扩展方向见 **[docs/STATUS.zh-CN.md](./docs/STATUS.zh-CN.md)**。

## 目录结构

```
daoing-dsh-memory/
├── lib/                    # 预构建产物（host + 浏览器 bundle + typert）
├── src/                    # TypeScript 源码（供参考与迭代）
├── skill/                  # 随包附带的 memory-extraction skill（独立 .md）
├── cordis.patch.yml        # 把插件接进 DSH 的 profile patch
├── scripts/                # prepare 与 install-skill 辅助脚本
└── docs/                   # INSTALL · DESIGN · STATUS · BUILDING · FAQ
```

## 构建与发布

本仓库直接携带构建产物（`lib/`），因此安装它**无需** DSH monorepo 工具链。包如何产出、如何发布到 npm、如何上架 DSH 插件市场，见 **[docs/BUILDING.zh-CN.md](./docs/BUILDING.zh-CN.md)**。

## 许可

[MIT](./LICENSE) © daoing
