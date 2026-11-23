# 模组坊 · 凡人修仙传模组平台

玩家在这里上传、浏览、下载模组；游戏里「标题画面 → 模组 → 模组平台」连上本站后可以一键安装、更新。

- 零依赖：只要 Node.js 18 以上，不用 `npm install`。
- 数据存在一个目录里：`db.json` 存账号、模组信息、评分，`mods/<id>/` 存各版本的 `.fmod` 和图标。备份就是拷这个目录。

## 跑起来

```bash
cd platform
node server.mjs                      # 默认 http://localhost:8787，数据放在 platform/data
PORT=80 DATA_DIR=/srv/modfang ADMIN_TOKEN=换成一长串随机字符 node server.mjs
```

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8787 | 监听端口 |
| `DATA_DIR` | `./data` | 数据目录（要能写、要备份） |
| `ADMIN_TOKEN` | 空 | 管理员口令，不设就没有管理接口 |
| `CORS_ORIGIN` | `*` | 允许哪些网页调用接口。游戏可能跑在 `file://`、桌面版或别的域名，所以默认全开 |

### Docker

```bash
docker build -t modfang platform
docker run -d -p 8787:8787 -v /srv/modfang:/data -e ADMIN_TOKEN=... --restart=always modfang
```

### 上线建议

- 前面挂一层 Nginx / Caddy 或云厂商的负载均衡，配好 HTTPS。游戏如果是 https 网页，平台也必须是 https，否则浏览器会拦。
- 经过反向代理时会读 `X-Forwarded-For` 来限流，记得让代理传这个头。
- 上传上限是 20MB 一个包。反向代理的请求体上限也要调到 21MB 以上（Nginx：`client_max_body_size 21m;`）。
- 单机可以撑几万个模组、几十万次下载。再大要换成正经数据库和对象存储，接口不变即可。

## 游戏怎么连

- 玩家自己连：标题画面 → 模组 → 模组平台 → 填本站地址 → 连接。
- 打包时预置地址：构建游戏时设 `VITE_MOD_STORE=https://你的平台地址`，玩家打开模组平台页就是连好的：
  ```bash
  VITE_MOD_STORE=https://mods.example.com npm run build
  ```

## 做模组、发模组

1. 照着 `mods/qingming/` 的样子写一个文件夹，里面有 `manifest.json`、`index.js` 和图片。接口说明在 `src/mod/types.ts`，类型提示在 `mods/sdk/`。
2. 打包：`npx tsx tools/mod-pack.ts mods/你的模组`，得到 `dist-mods/<id>-<版本>.fmod`。
3. 上传：在本站注册登录 → 发布模组 → 选 `.fmod`。
4. 更新：把 `manifest.json` 里的版本号调高，重新打包、上传。

规则：

- 模组 id 只属于第一个发布它的人。
- 同一版本号不能重复发布，版本号不能倒退。
- 模组里新加的法术、物品、敌人，id 都要以「模组 id + 下划线」开头。

## 接口

除特别注明外都返回 JSON。出错时返回 `{ "error": "说明" }`，并带上对应的 HTTP 状态码。需要登录的接口在请求头里带 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | `{ ok, version, mods }` |
| POST | `/api/auth/register` | `{ name, password }` → `{ name, token }`（token 30 天有效） |
| POST | `/api/auth/login` | 同上 |
| POST | `/api/auth/logout` | 作废当前 token |
| GET | `/api/me` | 登录：我发布的模组（含已下架的） |
| GET | `/api/mods?q=&sort=downloads\|new\|rating&tag=&page=` | 列表，每页 24 个 → `{ total, page, mods: [卡片] }` |
| GET | `/api/mods/:id` | 详情：卡片字段 + `deps`、`versions[]`（含 sha256） |
| GET | `/api/mods/:id/download[?v=x.y.z][&dl]` | 下载模组包（默认最新版），下载数 +1；带 `dl` 时浏览器存成文件 |
| GET | `/api/mods/:id/icon` | 图标图片 |
| POST | `/api/mods` | 登录：请求体就是 `.fmod` 的内容，用于发布或更新 |
| POST | `/api/mods/:id/rate` | 登录：`{ stars: 1–5 }`，不能给自己打分 |
| DELETE | `/api/mods/:id` | 作者本人或管理员：下架（文件保留） |
| POST | `/api/admin/mods/:id/hidden` | 请求头带 `X-Admin-Token`，请求体 `{ hidden: true\|false }`：下架 / 重新上架 |

卡片字段：`id name version author owner desc tags downloads rating ratings updated created size icon`。

## 安全

- 密码用 scrypt 加盐存储；数据库里只存 token 的 sha256。
- 注册登录每 IP 每 10 分钟限 20 次，上传每 IP 每小时限 30 次，评分每小时限 60 次。
- 上传的包按同一套规则校验：格式、id、版本号、文件名、大小、图标类型。不合格直接拒收。
- 网页带内容安全策略，只执行本站脚本。玩家写的名字、简介一律当纯文本显示。
- 模组本身是代码，平台不审查代码内容。管理员可以用下架接口处理有问题的模组。以后要做人工审核，可以在发布接口里加一个「待审」状态。

## 测试

```bash
node test/api.test.mjs ../dist-mods/qingming-1.0.0.fmod
```

测试会起一个临时实例，把注册、发布、搜索、下载、评分、更新、下架、重启都走一遍。
