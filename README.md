# ATLAS Quant Lab

ATLAS 是一个美股与港股的量化研究和模拟组合系统。量化计算在本地电脑运行，服务器接收结果、持久化、向前端提供数据，并负责微信机器人通知与回调。

## 架构

1. 本地量化程序生成符合 `backend/sample_quant_result.json` 的 JSON。
2. `tools/push_quant_result.py` 通过带 Bearer Token 的 HTTPS 请求上传结果。
3. FastAPI 校验数据并以事务方式写入 SQLite。
4. 前端读取 `/api/v1/dashboard/latest`。
5. 配置企业微信机器人 Webhook 后，每次新结果会自动推送摘要。

## API

- `GET /api/v1/health`：健康检查。
- `POST /api/v1/quant/runs`：上传量化结果，需要 Bearer Token。
- `GET /api/v1/dashboard/latest`：读取最新展示数据。
- `GET /api/v1/quant/runs`：读取历史运行摘要。
- `GET /api/v1/quant/runs/{run_id}`：读取指定运行。
- `GET|POST /api/v1/wechat/callback`：机器人验证与回调。
- `GET /api/docs`：OpenAPI 文档。

上传接口支持 `X-Idempotency-Key`，重复上传相同结果不会重复入库；同一幂等键携带不同内容会返回 409。

## 本地推送示例

```bash
export ATLAS_API_URL="https://your-domain.example"
export ATLAS_API_TOKEN="从服务器安全配置中读取"
python3 tools/push_quant_result.py backend/sample_quant_result.json
```

生产环境密钥只保存在服务器的 `~/.config/paper-trading/backend.env`，不会提交到 Git。
