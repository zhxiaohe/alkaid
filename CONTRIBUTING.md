# 贡献指南

感谢你对 Alkaid 瑶光的关注！本文说明参与贡献的流程与规范，请在提交 Issue 或 Pull Request 前通读一遍。

## 目录

- [行为准则](#行为准则)
- [开发环境准备](#开发环境准备)
- [贡献流程](#贡献流程)
- [分支命名](#分支命名)
- [提交信息规范](#提交信息规范)
- [Pull Request 规范](#pull-request-规范)
- [代码规范](#代码规范)
- [安全红线](#安全红线)

## 行为准则

参与本项目即表示你同意遵守 [Contributor Covenant 行为准则](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)。请保持尊重与专业。

## 开发环境准备

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 提交前必须自行运行

请在你的本地环境跑通以下检查，**CI 与维护者不会代为执行**：

```bash
cd frontend
npm run typecheck   # 类型检查必须通过
npm run build       # 构建必须成功
```

> 后端迁入后，此处会补充 `go build ./...` 与 `go test ./...` 的要求。

## 贡献流程

1. **先搜后提**：在提交 Issue 前，先搜索是否已有相同或相关 Issue。
2. **先讨论后编码**：较大的功能改动或架构调整，请先开 Issue 说明动机与方案，达成一致后再动手，避免白做。
3. **从 main 新建分支**开发，不要直接在 `main` 上提交。
4. 按[提交信息规范](#提交信息规范)提交改动，保持每个提交逻辑内聚。
5. 推送分支并创建 Pull Request，按下方模板填写。
6. 通过评审后由维护者合并。**贡献者不要自行合并到 main。**

## 分支命名

使用 `类型/简短描述` 的格式，描述用小写英文和连字符：

```
feat/inference-canary-rollout
fix/env-switch-race
docs/k8s-dependency-list
refactor/servicetree-package
chore/bump-deps
```

类型与[提交信息规范](#提交信息规范)保持一致。

## 提交信息规范

采用 `类型: 描述` 的格式，描述使用中文，简洁说明**做了什么**：

```
feat: 推理服务详情页补 HAMi 共享显存展示
fix: 切换环境后 X-ENV-ID 未即时生效
docs: 新增 K8s 部署依赖组件清单
refactor: 服务树模块拆分独立 package
chore: 升级 element-plus 到 2.3.4
```

常用类型：

| 类型 | 含义 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档变更 |
| `refactor` | 重构（不改变外部行为） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `chore` | 构建、依赖、工具链等杂项 |

要求：

- 一个提交只做一件事，不要把无关改动混在一起
- 描述具体，避免「修复 bug」「更新代码」这类无信息量的表述
- 破坏性变更请在描述中明确标注影响范围

## Pull Request 规范

PR 标题格式与提交信息一致（`类型: 描述`）。PR 描述请包含以下章节：

```markdown
## 改动说明
<!-- 这个 PR 做了什么，为什么这么做 -->

## 关联 Issue
Closes #123

## 改动类型
- [ ] 新功能  - [ ] 缺陷修复  - [ ] 文档  - [ ] 重构

## 自测情况
<!-- 贴出 typecheck / build 的执行结果 -->

## 影响范围与风险
<!-- 是否影响已有接口、配置或部署方式；有无破坏性变更 -->

## 截图 / 录屏
<!-- UI 改动请提供，便于评审 -->
```

- 若与某个 Issue 相关，请使用 `Closes #编号` 语法，合并时自动关闭该 Issue。
- 保持 PR 聚焦，一个 PR 解决一个问题。过大的改动请拆分。
- 涉及 UI 改动的，请附上截图或录屏。
- 评审意见请通过追加提交解决，不要强推覆盖历史。

## 代码规范

### 通用

- 遵循所在语言与目录的既有风格，保持局部一致性优先
- 新代码需要必要的注释，说明**为什么**这么做（而非复述代码在做什么）
- 不引入与本项目技术栈冲突或定位重叠的新依赖，如有必要请先在 Issue 中讨论

### 前端

- Vue 3 Composition API + `<script setup>`
- TypeScript 类型需完整，禁止滥用 `any`
- 接口定义集中在 `src/api/`，不要在组件里散写请求

### 后端（迁入后适用）

- 遵循 Go 官方风格，提交前运行 `gofmt`
- 模块间通过明确的 interface 交互，不互相调用内部实现
- 可替换后端（日志 / 监控 / 对象存储）必须走 interface 抽象，不要硬编码具体厂商 SDK

## 安全红线

**以下内容绝对不允许出现在 Issue、提交或 Pull Request 中：**

- 任何密钥、口令、Token、AK/SK、私钥、证书
- `kubeconfig` 内容或集群访问凭据
- 内部域名、内网 IP、真实业务数据
- 环境变量文件（`.env.local`、`settings.local.yml` 等）

提交前请自查：

```bash
git diff --cached | grep -inE "password|secret|token|access_key|private_key|BEGIN .*PRIVATE KEY"
```

如果误提交了凭据，请立即联系维护者按 [SECURITY.md](SECURITY.md) 处理，并轮换该凭据。

## 有问题？

对贡献流程有疑问，可以先开一个 `question` 类型的 Issue，或在相关 Issue 下留言。
