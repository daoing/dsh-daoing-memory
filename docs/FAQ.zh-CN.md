# 常见问题

[English →](./FAQ.md)

**我的记忆存在哪里？**
存在一个 SQLite 库 `memory.db` 里，位于你的 DSH 存储目录（首次写入时创建），被所有会话共享。

**卸载会删掉我的记忆吗？**
不会。`dsh plugin remove` 移除插件代码与其 profile 行，但保留 `memory.db`。重新安装即可找回记忆。

**怎么彻底清空记忆？**
停掉 DSH，然后删除 DSH 存储目录下的 `memory.db`。这是唯一破坏性的重置，无法撤销。

**为什么有两种安装渠道？**
`dsh plugin add <包名>` 从 npm 解析（发布后更省事）；`dsh plugin add github:owner/repo` 直接从源码装（发布前可用，或用于固定分支/提交）。两者结果一致。

**会和内置的 memory 插件冲突吗？**
profile patch 按行 id 后写覆盖。安装 `dsh-daoing-memory` 会把 `memory` / `memory-tools` 行重新指向本实现，而不是新增一份。见 INSTALL 的环境二。

**召回怎么判断相关性？**
按关键词/情境与查询匹配。经验库是进程级全局的，因此除非你显式传 `context` 收窄，否则每条经验都是候选。

**用向量/嵌入索引吗？**
v1 不用。召回是在一个经过治理、可信的库上做关键词/情境相关性匹配。向量辅助召回是规划中的扩展（见 STATUS）。

**我能手改提炼 skill 吗？**
能——它就是一个普通 Markdown 文件。先运行 `install-skill.mjs` 放置，然后编辑 skill 目录里的那份。加 `--force` 重跑会用随包版本覆盖你的改动，所以请改“放置后的那份”，别改源头。

**schema 升级安全吗？**
安全。迁移只做加法（绝不破坏），由 `schema_version` 表驱动。升级插件绝不丢失记忆。

**人和 agent 都能改记忆吗？**
能。agent 用 `memory_*` 工具；你用工作台的“人工运维”。两者都记入同一本只增不删的账本。

**支持哪些 profile？**
任何会加载插件的 DSH profile；示例用 `web`。请把 `dsh plugin --profile <name>` 里的名字换成你的 profile。
