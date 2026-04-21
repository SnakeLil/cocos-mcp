# Cocos MCP for Cocos Creator 2.x

面向 Cocos Creator 2.x 的 MCP Server 扩展，主要目标是让 AI 助手通过 MCP 协议操作 Cocos Creator 2.4.x 项目，用于页面搭建、场景修改、节点布局、组件配置、脚本生成与脚本挂载。

当前版本重点支持 Cocos Creator 2.x，已在 2.4.x 使用方式上做兼容设计。

## 功能特性

- MCP HTTP 服务：在 Cocos Creator 扩展内启动本地 MCP Server，默认地址为 `http://127.0.0.1:3100/mcp`。
- 编辑器面板：在 Creator 内提供 Cocos MCP 2.x 控制面板，可配置端口、启动和停止服务。
- 场景操作：读取当前场景、打开/保存场景、获取层级结构、执行场景进程辅助逻辑。
- 节点操作：查询、创建、删除、复制、移动节点，修改位置、尺寸、旋转、缩放、激活状态、名称等。
- 组件操作：添加/删除组件，查询组件，设置组件属性，挂载脚本组件，并支持通过专用接口绑定资源字段。
- 资产操作：查询、创建、复制、移动、删除、导入资产，读取 meta/uuid，并在文件变更后刷新 AssetDB。
- 脚本工作流：读取、创建、更新、追加、删除脚本文件，刷新脚本资产，并支持创建脚本后挂载到节点。
- Prefab 基础操作：浏览、创建、复制、删除 prefab，实例化 prefab 到当前场景。
- 构建/预览辅助：读取 Creator 2.x 构建配置，打开 Builder 面板，打开 Game Preview 面板，检测 build/preview 能力边界。
- 场景保存：通过编辑器内存场景序列化和 `assetdb.createOrSave` 进行正式保存，不依赖不稳定的 `Editor.scene.save`。
- 场景资源绑定：通过正式工具把 `SpriteFrame` 等资源绑定到节点和脚本字段，并可直接保存当前场景。
- 批量计划执行：通过 `workflow_plan`、`workflow_scene_apply`、`workflow_scene_bind` 执行 YAML/Figma 分析后生成的多步骤场景计划。
- 工具配置管理：支持工具开关配置，并自动兼容旧版资产工具配置。

## 当前定位

这个项目不是 Cocos Creator 官方自动化接口，也不是完整替代编辑器 UI 的无头构建系统。它是一个面向 AI Agent 的 Creator 2.x 扩展层，负责把 MCP 工具调用转成 Creator 2.x 能执行的编辑器、场景和文件操作。

适合做：

- 根据设计稿信息创建或调整 Cocos UI 页面。
- 批量修改节点布局、层级、组件属性。
- 生成 TypeScript/JavaScript 脚本并挂载到指定节点。
- 查询和导入资源，并刷新 Creator 资源数据库。
- 让 AI 辅助维护 Cocos Creator 2.x 项目结构。

不适合直接承诺：

- 完整无头构建。
- 完整无头预览服务器生命周期控制。

Creator 2.x 的部分 Builder、Preview、Prefab 内部 API 并不稳定公开，因此本项目在这些能力上采用“能真实控制的就控制，不能稳定控制的明确返回能力边界”的策略。

## 安装说明

### 环境要求

- Cocos Creator 2.x，推荐 2.4.x。
- Node.js 和 npm，用于编译 TypeScript。
- 一个 Cocos Creator 2.x 项目。

### 构建扩展

在本仓库目录执行：

```bash
cd <cocos-mcp-repo>
npm install
npm run build
```

构建后会生成 `dist/` 目录。Creator 实际加载入口为：

- `main.js` -> `dist/main.js`
- `scene.js` -> `dist/scene.js`

### 安装到 Cocos Creator 项目

推荐把本仓库软链接到目标项目的 `packages/cocos-mcp`：

```bash
cd <your-cocos-project>
mkdir -p packages
ln -s <cocos-mcp-repo> packages/cocos-mcp
```

也可以直接复制整个目录：

```bash
mkdir -p <your-cocos-project>/packages
cp -R <cocos-mcp-repo> <your-cocos-project>/packages/cocos-mcp
```

其中：

- `<cocos-mcp-repo>` 表示本仓库所在目录，例如 `/path/to/cocos-mcp`。
- `<your-cocos-project>` 表示你的 Cocos Creator 2.x 项目根目录，也就是包含 `assets/`、`settings/`、`project.json` 的目录。

安装后重启 Cocos Creator，或在 Creator 的扩展/包管理界面中 Reload 该扩展。

### 打开控制面板

在 Cocos Creator 菜单中打开：

```text
Panel -> Cocos MCP 2.x
```

如果菜单中没有看到面板：

- 确认扩展目录位于项目的 `packages/cocos-mcp` 下。
- 确认执行过 `npm run build`，并且存在 `dist/main.js` 和 `dist/scene.js`。
- 在扩展/包管理面板中 Reload `cocos-mcp`。
- 查看 Creator 控制台是否有扩展加载错误。

## 使用方法

### 启动 MCP 服务

1. 打开 Cocos Creator 项目。
2. 打开 `Panel -> Cocos MCP 2.x`。
3. 保持默认端口 `3100`，或输入自定义端口。
4. 点击 `Start`。
5. 浏览器访问健康检查地址：

```text
http://127.0.0.1:3100/health
```

正常返回示例：

```json
{
  "status": "ok",
  "running": true,
  "port": 3100,
  "clients": 1,
  "tools": 30
}
```

### 常用端点

- 健康检查：`http://127.0.0.1:3100/health`
- MCP 端点：`http://127.0.0.1:3100/mcp`
- 工具清单：`http://127.0.0.1:3100/api/tools`

### 验证 MCP 工具列表

```bash
curl http://127.0.0.1:3100/api/tools
```

如果服务正常，应能看到 `scene_management`、`component_resource`、`script_workflow`、`workflow_scene_apply`、`workflow_scene_bind` 等工具。

## 推荐工作流

### 资源绑定与场景保存

从当前版本开始，不推荐 AI 或人工直接修改 `.fire` 文件。推荐顺序如下：

1. 通过 MCP 查询当前场景、节点、组件和资源 UUID。
2. 使用 `workflow_scene_bind` 或 `scene_management` 的 `bind_resources` action 在编辑器内存场景中完成资源绑定。
3. 让 MCP 通过编辑器 API 保存当前场景。

推荐原因：

- 避免“磁盘上的 `.fire`”和“编辑器内存场景”状态分叉。
- 避免错误 IPC 或外部 patch 把场景写坏。
- 让资源绑定、节点调整和保存处于同一条 Creator 运行时链路中。

### 什么时候用哪个工具

- 普通值属性修改：优先用 `component_property`
  - 适合 `boolean`、`number`、`string`、普通对象、节点引用、组件引用等。
- 资源字段绑定：优先用 `component_resource` 或 `workflow_scene_bind`
  - 适合 `cc.Sprite.spriteFrame`、自定义脚本上的 `@property(cc.SpriteFrame)` 等。
- 页面/场景批量修改：优先用 `workflow_scene_apply`
- 资源绑定 + 自动保存：优先用 `workflow_scene_bind`

## 工具体系

当前 MCP 服务暴露 30 个工具。工具名采用 `category_operation` 风格，每个工具内部通过 `action` 参数区分具体操作。

### Scene 工具

| 工具 | 说明 |
| --- | --- |
| `scene_management` | 场景管理，包括当前场景、场景列表、打开/重载/保存/创建场景，以及资源绑定。 |
| `scene_hierarchy` | 读取当前场景节点层级。 |
| `scene_execution_control` | 低层场景进程辅助工具，用于调用 scene-script 能力。 |

### Node 工具

| 工具 | 说明 |
| --- | --- |
| `node_query` | 查询节点，读取节点详情。 |
| `node_lifecycle` | 创建、删除、移动、复制节点。 |
| `node_transform` | 修改节点属性和 transform，包括位置、尺寸、旋转、缩放等。 |

### Component 工具

| 工具 | 说明 |
| --- | --- |
| `component_manage` | 添加或移除组件。 |
| `component_query` | 查询节点组件和可用内置组件。 |
| `component_property` | 设置组件属性，支持普通值、节点引用、组件引用和部分 typed asset 引用。 |
| `component_resource` | 通过专用接口绑定强类型资源字段，例如 `SpriteFrame`。 |
| `component_script` | 按脚本类名把脚本组件挂载到节点。 |

### Prefab 工具

| 工具 | 说明 |
| --- | --- |
| `prefab_browse` | 列出和检查 prefab 资产。 |
| `prefab_lifecycle` | 创建、复制、删除 prefab 资产。 |
| `prefab_instance` | 将 prefab 实例化到当前场景。 |

### Project 与 Asset 工具

| 工具 | 说明 |
| --- | --- |
| `project_manage` | 获取项目信息、项目设置、刷新资产、打开预览面板。 |
| `project_build_system` | 构建/预览辅助，包括读取构建配置、打开 Builder、打开 Preview、检测能力边界。 |
| `project_asset_query` | 按路径、类型、名称查询资产。 |
| `project_asset_operations` | 创建、复制、移动、删除、保存、导入、刷新资产。 |
| `project_asset_analyze` | 查询资产 uuid/meta 等信息。 |

### Script 工具

| 工具 | 说明 |
| --- | --- |
| `script_file` | 读取、创建、更新、追加、删除脚本文件，并刷新脚本资产。 |
| `script_workflow` | 创建脚本并挂载、挂载已有脚本、刷新后挂载脚本。 |

### Workflow 工具

| 工具 | 说明 |
| --- | --- |
| `workflow_plan` | 执行或 dry-run 一组 MCP 工具调用步骤，适合承接 Figma/YAML 转换后的页面生成计划。 |
| `workflow_scene_apply` | 执行一组场景步骤，并支持前后重载场景、刷新脚本和保存场景。 |
| `workflow_scene_bind` | 执行一组正式的场景资源绑定步骤，并可直接保存当前场景。 |

### Debug 与 Server 工具

| 工具 | 说明 |
| --- | --- |
| `debug_console` | 调试和诊断辅助。 |
| `debug_logs` | 读取项目或编辑器日志。 |
| `preferences_manage` | 管理扩展自身偏好配置。 |
| `broadcast_message` | 轻量内部广播日志。 |
| `validation_helpers` | 给 AI 客户端使用的小型参数校验辅助。 |
| `server_info` | 查询 MCP 服务状态和本机网络信息。 |

## 连接 AI 助手配置

### Codex

在 Codex 的 MCP 配置中加入本服务。具体配置文件位置取决于你的 Codex 安装方式，核心配置如下：

```toml
[mcp_servers.cocos-mcp]
url = "http://127.0.0.1:3100/mcp"
```

配置后重启 Codex，并确认 MCP 列表中能看到 `cocos-mcp` 且工具数不为 0。

如果 Codex 显示 `Tools: (none)`：

- 确认 Creator 面板里服务已启动。
- 确认 `http://127.0.0.1:3100/health` 返回 `running: true`。
- 确认 `http://127.0.0.1:3100/api/tools` 能看到工具列表。
- 重启 Codex，让 MCP 客户端重新执行 initialize 和 tools/list。
- 确认配置 URL 是 `/mcp`，不是 `/health` 或 `/api/tools`。

### Claude Desktop / 其他 MCP 客户端

如果客户端支持 HTTP/Streamable HTTP MCP，配置 URL：

```text
http://127.0.0.1:3100/mcp
```

如果客户端只支持 stdio MCP，则不能直接连接本扩展，需要额外的 HTTP-to-stdio MCP 代理。

### Cursor / Continue / 其他编辑器助手

优先选择 HTTP MCP Server 配置方式，URL 填：

```text
http://127.0.0.1:3100/mcp
```

如果客户端要求 transport 类型，选择 HTTP、Streamable HTTP 或 remote MCP。不要选择 stdio，除非你额外配置了代理。

## 故障排除

### 不要让模型手动修改 `.fire`

不推荐直接手动 patch 场景 `.fire` 文件，原因是：

- Creator 打开的场景是内存态，直接改磁盘文件容易被后续保存覆盖。
- 资源字段的序列化格式容易写错。
- 不同 Creator 2.x 小版本的场景写回细节并不完全一致。

推荐做法：

- 节点/组件修改：通过 MCP 工具完成。
- 资源绑定：通过 `component_resource` 或 `workflow_scene_bind` 完成。
- 保存：通过 `scene_management.save` 完成。

### 面板中一直 Loading

可能原因：

- 扩展主进程没有正确加载。
- `dist/main.js` 不存在。
- `main.js` 入口无法 require 到 `dist/main.js`。
- Creator 缓存了旧扩展。

处理方式：

```bash
cd <cocos-mcp-repo>
npm run build
```

然后在 Creator 扩展/包管理中 Reload `cocos-mcp`，必要时重启 Creator。

### 控制台提示 `Failed to uncache module dist/main.js: Cannot find it`

说明尚未构建或构建产物缺失。

处理方式：

```bash
cd <cocos-mcp-repo>
npm install
npm run build
```

### 控制台提示 `[methods] in package [cocos-mcp] is not a function`

通常是 Creator 2.x 扩展导出格式不兼容或加载到了旧代码。

处理方式：

- 确认当前代码中 `src/main.ts` 导出了 `methods() {}`。
- 执行 `npm run build`。
- Reload 扩展或重启 Creator。

### `component_property` 或 `component_resource` 对资源字段失败

如果是 `cc.SpriteFrame`、材质、Prefab 等资源字段，不要优先尝试裸写对象或直接猜测 `.fire` 序列化结构。

推荐顺序：

1. 用 `workflow_scene_bind` 绑定资源并保存。
2. 或用 `scene_management` 的 `bind_resources` action。
3. 必要时再退回 `scene_execution_control.execute_debug_script` 做一次性排障。

说明：

- `component_property` 对普通值最稳定。
- 资源字段绑定优先走专用场景资源工具。

### `scene_management.save` 失败

当前版本的 `scene_management.save` 已优先使用编辑器内存场景序列化后通过 `assetdb.createOrSave` 落盘。

如果仍失败，通常是以下原因：

- 当前场景 URL 无法解析。
- `Editor.assetdb.createOrSave` 在当前编辑器上下文不可用。
- 场景已被第三方扩展或异常状态破坏。

建议处理方式：

- 先调用 `scene_management.get_current` 确认当前场景。
- 再调用 `scene_management.reload_current` 重载场景。
- 之后重新执行 `workflow_scene_bind` 或 `workflow_scene_apply`。

### 构建/预览不能被 AI 完整控制

这是 Creator 2.x 扩展 API 的限制。当前稳定能力是：

- 打开 Builder 面板。
- 读取 `settings/builder.json`。
- 打开 Game Preview 面板。
- 检测 build/preview 能力边界。

完整构建参数确认和最终构建建议仍通过 Creator Builder 面板完成。

## 开发说明

常用命令：

```bash
npm run build
npm run watch
```

主要源码：

- `src/main.ts`：Creator 扩展主进程入口。
- `src/scene.ts`：Creator scene-script 入口，负责场景内节点和组件操作。
- `src/mcp-server.ts`：MCP HTTP 服务实现。
- `src/tool-catalog.ts`：工具目录和默认开关。
- `src/tools/*`：各类 MCP 工具实现。

修改源码后需要重新构建：

```bash
npm run build
```

然后在 Creator 中 Reload 扩展。

## 安全说明

MCP 服务默认只监听：

```text
127.0.0.1
```

这意味着默认仅本机可访问。不要随意改成 `0.0.0.0` 暴露到局域网或公网，因为该服务具备修改项目文件、脚本和场景的能力。

## 许可证

`MIT`
