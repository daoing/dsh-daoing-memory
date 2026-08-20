# 构建与发布

[English →](./BUILDING.md)

`dsh-daoing-memory` 如何产出、如何发布、如何上架——以及关于“构建独立性”的如实说明。

---

## 一句话版

本仓库**自带构建产物**（`lib/`）。无论走 npm 还是 git 地址，安装过程**都不执行构建**。产物由 DSH 构建工具链产出并提交/发布，因此终端用户完全不需要 monorepo。

```
源码 (src/)  --(DSH 构建工具链)-->  lib/  --(提交 / npm 发布)-->  可安装
```

## 构建了什么

插件有两半，都产出到 `lib/`：

- **Host 半**（Node）：`lib/index.js`、`lib/tools.js`、`lib/invariant.js`，加 `lib/types/**`（`/core`、`/store`、`/service`、`/types` 等的类型入口）以及 typert 描述符 `lib/typert.host.js` / `lib/typert.remote-client.js`。
- **Client 半**（浏览器）：`lib/client.js` —— 工作台 UI 的 module-loader bundle，加 `lib/types/client/**`。

## 复现构建（维护者）

规范构建在 DSH 源码检出里进行，因为本插件的客户端 bundle 使用 DSH 的共享构建设置、host 构建使用 workspace 的 TypeScript 项目图。在 DSH monorepo 中：

```sh
pnpm run build:lib        # 构建 workspace 的 host + client 两面
```

然后把 memory 包的 `lib/` 拷进本仓库（或让发布流水线指向它）。包的 `exports`、`files` 与 `dsh` 清单已经描述了这些产物如何被消费。

> **现状：** 完全解耦、在本仓库内从源码自行构建，是头号扩展方向（见 STATUS）。
> 它意味着内联（vendoring）DSH 的客户端 bundle 构建设置，并把 workspace 类型
> 引用换成已发布的 `@deepseek-ai/*` 包。在此之前，重建发生在 DSH 检出里，
> 产物再被搬运到这里。

## 发布到 npm

有了 npm 账号 / 组织后：

```sh
# 1. 确保 lib/ 是最新的、package.json 版本号已 bump
# 2. 先 dry-run 看清将发布什么
npm publish --dry-run
# 3. 发布（若用 scope，加 --access public）
npm publish
```

`files` 字段把 tarball 限定为 `lib/`、`skill/`、`cordis.patch.yml`、`README.md`、`LICENSE`。发布后，`dsh plugin --profile web add dsh-daoing-memory` 即可从 registry 解析。

## 上架 DSH 插件市场

DSH 插件市场通过 GitHub 仓库上的 **`dsh-plugin`** topic 来发现插件。上架步骤：

1. 把本仓库推到 GitHub（如 `daoing/dsh-daoing-memory`）。
2. 在仓库 **About** 设置里加上 topic `dsh-plugin`。
3. 保留 `dsh.bundle.patch` 声明（正是它让包能作为 profile 层被安装）。

之后它就能被市场发现，也能直接按 git 地址安装：

```sh
dsh plugin --profile web add github:daoing/dsh-daoing-memory
```

## 改名说明

分发包名为 `dsh-daoing-memory`。内部，构建产物一致地携带同一标识（module-loader bundle id、typert 的 `package` 字段、RPC 方法前缀），因此 host 与 client 两半彼此一致。若你改包名，请重新生成产物，确保所有自引用与新名字匹配。
