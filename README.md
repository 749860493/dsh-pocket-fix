# dsh-pocket 窄屏白屏修复

> **一句话**：DSH 0.2.2-rc.1 改了 `AppFrame` 的子元素顺序，dsh-pocket 2.12.0 的位置选择器全部错位，
> 手机（视口 < 768px）上会话正文区整片空白。本仓库给出源码级修复 + 一个可直接打到已安装插件上的补丁脚本。

上游 issue：[#208](https://github.com/shaobeichen/dsh-pocket/issues/208) · [#209](https://github.com/shaobeichen/dsh-pocket/issues/209)
（PR [#200](https://github.com/shaobeichen/dsh-pocket/pull/200) 未合并）

---

## 现象

手机打开 pocket 入口，PIN 登录成功、会话列表能看到，点进会话后**正文区整片空白**。电脑上一切正常。

临时绕过：地址栏加 `?dsh-layout=desktop`（pocket 自带布局开关，会写 `localStorage['dsh-pocket.layout']`）。
代价是没有移动端适配，但字不会缩放。

## 根因

DSH 0.2.2-rc.1 的 `AppFrame` 在 `viewport < 768` 时自动进入抽屉模式，
把 `drawerMask` 作为 frame 的**第一个子元素**插进去：

```
drawerMask        ← 新增，占掉 :first-child
sidebarCol        ← 变成 :nth-child(2)
centerCol         ← 变成 :nth-child(3)
rightbarCol
bottomRow
overlayLayer
leadingSeat
```

而 dsh-pocket 2.12.0 的移动端适配用**位置选择器**定位：

| 选择器 | 本意 | 实际命中 |
| --- | --- | --- |
| `[data-mobile-nav="frame"] > :first-child` | sidebarCol | **drawerMask** |
| `[data-mobile-nav="frame"] > :nth-child(2)` | centerCol | **sidebarCol** |
| `:not([data-sidebar-collapsed]) > :first-child` | sidebarCol | **drawerMask** |

结果：`sidebarCol` 被拉进 `1fr` 主轨占满整宽，`centerCol` 留在官方 `grid-column:2` 的 0px 轨。

实测计算值（390×844）：

```
修复前  grid-template-columns: 390px 0px 0px
        centerCol  rect = x=390, width=0      ← 整屏空白
修复后  centerCol  rect = x=0,   width=390    ← 正常
```

复现条件：**视口 < 768px**（宿主抽屉断点），不是"手机就坏"。768–1023px 区间原本正常。

## 修复

`client/mobile/nav-targets.mjs`：

```diff
-export const DRAWER_SELECTOR = '[data-mobile-nav="frame"] > :first-child'
+export const DRAWER_SELECTOR = '[data-mobile-nav="frame"] > [class*="sidebarCol"]'
```

`client/mobile/mobile.css.ts` 三处：

```diff
-  [data-mobile-nav="frame"] > :nth-child(2) {
+  [data-mobile-nav="frame"] > [class*="centerCol"] {

-  [data-mobile-nav="frame"] > :first-child {
+  [data-mobile-nav="frame"] > [class*="sidebarCol"] {

-  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > :first-child {
+  [data-mobile-nav="frame"]:not([data-sidebar-collapsed]) > [class*="sidebarCol"] {
```

用 `class*="sidebarCol"`（不带下划线）而不是 `[class$="_sidebarCol"]`：
CSS Modules 的哈希分隔符配置变化时不会再次失配（#208 的建议）。

## 两种用法

### 方式 A：直接打到已安装的插件上（不用重新构建）

```bash
# 用 DSH 自带 node
node patch-installed.mjs check    # 看状态
node patch-installed.mjs apply    # 打补丁（自动备份）
node patch-installed.mjs revert   # 回滚
```

脚本遍历 `$DSH_HOME/profiles/*/node_modules/dsh-pocket/client/client.js`，
幂等，改前备份为 `.orig-layoutfix`。

### 方式 B：从源码构建

```bash
npm install
node client/build.mjs          # 产物写入 client/client.js（141KB）
# NODE_ENV=production node client/build.mjs   压缩版 107KB
```

然后替换已安装插件里的 `client/client.js`。

## 必须清浏览器缓存

`client.js` 响应头是 `cache-control: public, max-age=31536000, immutable` —— **强缓存一年**。
不清缓存，手机永远跑旧 bundle，改什么都没用。

- Safari：设置 → Safari → 清除历史记录与网站数据
- Chrome：设置 → 隐私和安全 → 清除浏览数据 → 缓存的图片和文件
- 或地址加随机参数：`http://<LAN-IP>:3081/?v=2`

## 实测验证

真实浏览器（Edge headless，390×844，iPhone UA，禁用缓存）：

```
centerCol   x=0  width=390
抽屉点击      sideX=0，4 个会话行全部可点
点会话        centerText 700+ 字符，正文完整渲染
             （标题、时间戳、状态、段落、composer、底部统计）
```

## 注意

- **升级 dsh-pocket 会覆盖 `client.js`**，补丁丢失，需重新 `apply`。
- 这是针对 2.12.0 的临时补丁，上游合并 PR #200 后应改用官方版本。
- 只改选择器，不动其他逻辑；`node --check` 通过。
- 本仓库已禁用 GitHub Actions（避免上游 CI 在本 fork 触发）。

## 仓库内容

本仓库是 [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) v2.12.0 的完整源码，
加上上述 4 处修复。新增文件：

| 文件 | 说明 |
| --- | --- |
| `PATCH-README.md` | 与首页相同的修复说明（副本） |
| `patch-installed.mjs` | 打到已安装插件的补丁脚本 |

## License

上游 dsh-pocket 是 GPL-2.0，本补丁沿用 GPL-2.0。
