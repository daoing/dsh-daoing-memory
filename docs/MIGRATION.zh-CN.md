# 数据存放与迁移

`dsh-daoing-memory` 的数据存在哪里，以及如何迁移、备份。

[English →](./MIGRATION.md)

## 数据存在哪

所有记忆数据——经验、日记、事实、关心事项、使用报告、召回历史，以及只增不删的
审计账本——都存放在**单个 SQLite 文件**里：

```
<DSH_HOME>/storages/memory.db
```

- `DSH_HOME` 默认是 `~/.dsh`，所以通常路径是 `~/.dsh/storages/memory.db`。
- 存储用的是 Node 内置的 `node:sqlite`——无需任何外部数据库。
- 旁边还有个 `<DSH_HOME>/memory-workbench/` 目录，那是监控工作台的展示目录；
  **真正的数据全部在 `memory.db`**。
- 路径挂在 `DSH_HOME` 下，而不是某个 profile 里。因此同一个 `DSH_HOME` 下的
  多个 profile 共享同一份记忆库。

## 迁移

### 方法一：直接拷贝数据库文件（推荐，100% 完整）

1. **停掉 DSH。** 不要在进程还开着数据库时复制——写入途中拷贝可能损坏文件。
2. 把 `<旧 DSH_HOME>/storages/memory.db` 复制到目标环境的
   `<新 DSH_HOME>/storages/memory.db`。
3. 启动 DSH。

这一个文件带走**全部**：经验、日记、事实、关心事项、使用报告、召回事件，以及
审计账本。

**跨版本安全。** store 打开时会自动执行 schema 迁移（例如 v4→v5 的 `ALTER`），
所以旧版本插件写出的数据库，被新版本首次打开时会自动升级表结构。

### 方法二：逻辑导出（备份 / 查看用）

工作台 UI 有 **导出** 按钮，会下载 `memory-export-<时间戳>.json`（背后是
`exportLibrary`）。内容包含经验、使用报告、日记、事实、提取记录、召回事件和账本。

两点如实提醒：

- 这份导出**不含"关心事项"**（也不含巩固记录）。
- **没有对称的"整库还原"导入**。`ingest` 工具只接收*候选经验*，不是一键还原。

所以方法二适合备份、审计、人工查看——**不适合**做完整迁移。要完整迁移请用方法一。

### 方法三：用配置改存储位置

插件支持 `databasePath` 配置项，可以把数据库指到任意路径（例如同步盘或大容量盘）：

```yaml
# 在 cordis 组合里 memory 行的 config 中
databasePath: /your/custom/path/memory.db
```

## 小结

> 迁移 = 停 DSH → 把 `~/.dsh/storages/memory.db` 拷到目标环境同路径 → 重启。
> 单文件、含全部数据与审计账本、跨版本自动升级。
