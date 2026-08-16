# 氮气柜 Dummy 库存管理系统

内网可多人访问的 Dummy（陪片）库存管理网站。基础数据来自 `dummy.xlsx`（Wire Size / MBD / Dummy QTY / Remark）。

## 快速启动

```bash
npm install      # 首次：安装依赖
npm run build    # 构建前端
npm start        # 启动服务（默认端口 3000）
```

浏览器打开 `http://localhost:3000`；内网其他机器访问 `http://<服务器IP>:3000`。

首次启动会自动把 `dummy.xlsx` 导入到 SQLite（`data/dummy.db`），之后数据持久化在数据库里。

## 功能

| 功能 | 说明 |
|---|---|
| **看板** | 集中展示各型号 Dummy 剩余量，绿 / 黄 / 红颜色预警（绝对数量阈值，可配置） |
| **手动更新** | 粘贴消息自动解析（如「1.0pcc上1008367上来俩条」），或手动表单录入 |
| **上传同步** | 上传 xlsx/csv 快照，批量刷新库存并记录差异变动 |
| **导出** | 导出库存快照 / 变动明细（xlsx 或 csv） |
| **定时任务** | 每日 08:00 / 20:00 自动触发（当前为占位，扣减规则待接入） |
| **历史明细** | 每次变动的完整追溯 |

## 消息格式

`<线径> <料号> <方向词> <数量>条`，可一次粘贴多行：

- `1.0pcc上1008367上来俩条` → 1.0PCC 归还 2 条
- `2.0cu 10005932 消耗1条` → 2.0CU 消耗 1 条

方向词：`归还 / 上来 / 放回` 等 = 增加；`消耗 / 取走 / 领用` 等 = 减少。中文数量「两 / 俩 / 三…」自动识别。

## 预警阈值

默认：剩余 ≤3 显示黄色「偏低」，≤1 显示红色「告急」。存于 `settings` 表（`warn_threshold` / `danger_threshold`），可直接改数据库或后续加配置页。

## 目录结构

```
server/          后端（Express + node:sqlite + exceljs + node-cron）
  index.js       入口：静态托管 + API + 定时任务
  db.js          数据库初始化 / 建表 / 阈值
  importer.js    dummy.xlsx 导入 + 表格解析
  parser.js      消息解析器
  store.js       库存变动原子操作
  routes/        items / upload / export / transactions
  scheduler.js   每日 8:00 / 20:00 定时（占位）
client/          前端（Vue 3 + Vite）
  src/views/     Dashboard / Update / Upload / History
```

## 待办

- 定时任务「当日发布情况」的扣减规则待接入 `server/scheduler.js` 的 `runDaily`。
- 消息中的料号需与 `dummy.xlsx` 中 MBD 一致；不一致时解析会提示「需补正」，可手动选择料号。
