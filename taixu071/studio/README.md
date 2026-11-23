---
license: Apache License 2.0
title: 太虚问道录 · 寰宇篇
sdk: docker
app_port: 7860
pinned: false
---

# 太虚问道录 · 寰宇篇 v0.57

原创水墨修仙 RPG《太虚问道录》（纯前端单页），容器内由 FastAPI 托管静态资源，附带云存档与 NPC 自由对话接口。

- 首页：`/`
- 云存档：`GET /api/cloud/list`、`POST /api/cloud`、`GET /api/cloud/one?id=`
- NPC 自由对话：`POST /api/npc/chat`、`GET /api/npc/health`
- 健康检查：`GET /api/health`

NPC 对话的模型密钥：代码里带有默认值（只在服务器端使用）；要换密钥，在创空间「设置 → 密钥」里添加 `NPC_LLM_KEY` 即可覆盖。

构建：`docker build -t taixu . && docker run -p 7860:7860 -e NPC_LLM_KEY=... taixu`
