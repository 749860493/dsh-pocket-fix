# dsh-pocket 窄屏白屏修复

针对 **dsh-pocket 2.12.0** + **DSH 0.2.2-rc.1** 的窄屏白屏问题，给出源码级修复。

对应上游 issue：[#208](https://github.com/shaobeichen/dsh-pocket/issues/208) · [#209](https://github.com/shaobeichen/dsh-pocket/issues/209)（PR [#200](https://github.com/shaobeichen/dsh-pocket/pull/200) 未合并）

## 现象

手机上打开 pocket 入口，PIN 登录成功、会话列表能看到，但**会话正文区整片空白**。电脑上一切正常。

加 `?dsh-layout=desktop` 可临时绕过（pocket 自带布局开关，写 `localStorage['dsh-pocket.layout']`）。

## 根因

DSH 0.2.2-rc.1 的 `AppFrame` 在 `viewport < 768` 时自动进入抽屉模式，把 `drawerMask` 作为 frame 的**第一个子元素**插进去：

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
|---|---|---|
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

用 `class*="sidebarCol"`（不带下划线）而不是 `[class$="_sidebarCol"]`：CSS Modules 的哈希分隔符配置变化时不会再次失配（#208 的建议）。

## 构建

```bash
npm install
node client/build.mjs
```

产物写入 `client/client.js`。`NODE_ENV=production` 会 minify（107KB → 未压缩 141KB）。

## 实测验证

真实浏览器（Edge headless，390×844，iPhone UA，禁用缓存）：

```
centerCol   x=0  width=390
抽屉点击      sideX=0，4 个会话行全部可点
点会话        centerText 700+ 字符，正文完整渲染
             （标题、时间戳、状态、段落、composer、底部统计）
```

## 怎么用到已安装的插件上

改的是 `client/client.js`（打包产物）。装好后替换：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\desktop"
Copy-Item "$profile\node_modules\dsh-pocket\client\client.js" `
          "$profile\node_modules\dsh-pocket\client\client.js.orig" -Force
Copy-Item ".\client\client.js" `
          "$profile\node_modules\dsh-pocket\client\client.js" -Force
```

或者直接打补丁到已有 bundle（不重新构建）：见 [`patch-installed.mjs`](patch-installed.mjs)。

## 必须清浏览器缓存

`client.js` 响应头是 `cache-control: public, max-age=31536000, immutable` —— 强缓存一年。不清缓存，手机永远跑旧 bundle。

- Safari：设置 → Safari → 清除历史记录与网站数据
- Chrome：设置 → 隐私和安全 → 清除浏览数据 → 缓存的图片和文件
- 或地址加随机参数：`http://<LAN-IP>:3081/?v=2`

## 注意

- **升级 dsh-pocket 会覆盖 `client.js`**，补丁丢失，需重新应用。
- 这是针对 2.12.0 的临时补丁，上游合并 PR #200 后应改用官方版本。
- 只改选择器，不动其他逻辑；`node --check` 通过。

## License

上游 dsh-pocket 是 GPL-2.0，本补丁沿用 GPL-2.0。
