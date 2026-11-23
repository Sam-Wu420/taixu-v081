# 扩展模组接口（改游戏源码）

只有在模组**确实需要接口里没有的能力**时才这么做，比如：

- 新的事件（突破境界时、进城时）；
- 新的动作（加好感、开商店）；
- 新的内容类型（丹方、阵法）。

这样做改的是游戏本身，**玩家要更新游戏**，新接口才可用。

## 先看现成的通用口子

多数需求不用改游戏：数据表（`src/mod/tables.ts` 登记）能改游戏里的任何数据；前置钩子（`hooks.ts` 的 `has/fire`）能在事情发生前改写。缺的是**一张表没登记**，就在 `TABLES` 里加一行；缺的是**一个时机**，就在游戏代码那里加一句 `if (modx?.has('名字')) { const c = modx.fire('名字', {...}); … }`，并在 `types.ts` 的 `ModHooks`、`host.ts` 的 `HOOK_NAMES` 里登记。

## 原则

1. **给函数，不给对象**：接口里放 `g.addFavor(npcName, n)`，不要放 `g.npcs`。暴露内部对象，等于以后不能再改内部。
2. **校验、夹紧、截断**：模组传进来的数字要限制范围，文字要截长度，id 要检查存在。
3. **向后兼容**：
   - 只**加**，不改不删；
   - 加了新能力，`MOD_API` 加 1；
   - 用到新能力的模组在 `manifest.api` 里写新版本号，旧游戏会拒绝加载它，并提示「请更新游戏」。
4. **出错隔离**：新事件也走 `emit`，自动兜错。新动作里的错误要么抛给模组（模组可以 catch），要么吞掉并打日志，不能让游戏崩。

## 要改的地方

| 文件 | 改什么 |
|---|---|
| `src/mod/types.ts` | 接口类型：`ModGame`（新动作）、`ModEvents`（新事件）、`ModAPI.content`（新内容类型）；`MOD_API` +1 |
| `src/mod/host.ts` | 实现：`face()` 里加动作；`attach()` 里挂事件钩子；`api()` 里加内容注册 |
| `src/mod/hooks.ts` | 游戏本体要「问模组」的地方（城镇面板加按钮、NPC 交谈加选项、绘制……）先在 `ModBridge` 里加一个方法，`host.ts` 实现它 |
| `src/world/…`（游戏本身） | 在合适的地方调用 `modx?.xxx(...)`（从 `../mod/hooks` 引入）或 `this.mods?.xxx(...)`；没装模组时 `modx` 是 `null` |
| `src/mod/validate.ts` | 一般不用改；`MOD_API` 变了，校验自动跟上 |
| `platform/lib/validate.mjs` | 平台的校验规则，要和上面保持一致（`MOD_API` 同步改） |
| `mods/sdk/` | 重新生成类型提示：`npx tsc src/mod/types.ts --declaration --emitDeclarationOnly --skipLibCheck --target es2020 --moduleResolution bundler --module esnext --outDir mods/sdk` |
| `tools/test-mod.ts` / `tools/test-mod3.ts` | 给新能力加测试 |
| `tools/mod-try.ts` | 新能力要能被试跑工具检查到 |
| 本 skill 的 `reference/api.md`、`SKILL.md` 能力清单 | 补上新能力 |
| `README.md` | 版本记录 |

## 例子：加一个「境界突破」事件

1. 在 `types.ts` 的 `ModEvents` 里加：
   ```ts
   breakthrough: (g: ModGame, e: { realm: number; stage: number }) => void;
   ```
   然后 `MOD_API` 加 1。

2. 在 `host.ts` 里：
   - `Mod.hooks` 的初始值加上 `breakthrough: []`；
   - 新增方法：
     ```ts
     breakthrough(realm: number, stage: number) { this.emit('breakthrough', { realm, stage }); }
     ```
   - `game.ts` 里 `mods?: {…}` 的类型声明也加上这个方法。

3. 在游戏突破的地方调用。先用 `grep -n "突破\|breakthrough" src/world/*.ts` 找到结算点，然后加：
   ```ts
   this.mods?.breakthrough(h.realm, h.stage);
   ```

4. 测试：`tools/test-mod.ts` 里写一个监听 `breakthrough` 的小模组，模拟一次突破，断言回调被调用。

5. 跑全套：
   ```bash
   npx tsc --noEmit -p .
   npx tsx tools/test-mod.ts
   npx tsx tools/test-v053.ts
   npx tsx tools/test-v054.ts
   npx tsx tools/test-v0542.ts
   ```
   平台改了的话，再跑 `cd platform && node test/api.test.mjs`。

6. 更新文档和版本号，重新打包游戏（`npm run build`）。

## 例子：加一个「改 NPC 好感」的动作

```ts
// types.ts：ModGame
addFavor(npcName: string, n: number): boolean;

// host.ts：face()
addFavor: (name, n) => {
  const d = G().npcs.list.find((x) => x.alive && x.name === name);
  if (!d) return false;
  d.favor = Math.max(-100, Math.min(100, d.favor + Math.max(-20, Math.min(20, +n || 0))));   // 夹紧
  return true;
},
```

## 不要做的事

- 不要把整个 `Game` 交给模组，这等于没有接口。
- 不要在模组加载阶段（setup）就去碰游戏对象，那时候游戏还不存在。
- 不要为了一个模组的需求，去改原有的游戏数值或行为。能用新接口实现，就用新接口。
- 改完不要只跑类型检查：跑 test-mod 和老的回归测试，再在浏览器里看一眼。
