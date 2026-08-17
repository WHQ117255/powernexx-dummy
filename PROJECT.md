# powernexx dummy 管理系统 — 项目文档

> 氮气柜 Dummy(陪片)库存管理系统 · 公网可访问 · 支持多人协作

---

## 一、项目概述

本系统用于统计氮气柜内 **Dummy(陪片)** 的库存情况,取代原先手工维护 Excel 的方式,提供:

- 集中式总览看板,直观查看每种 Dummy 的剩余量;
- 自然语言消息录入(如「拿给7086两条10002220dummy」),自动解析线径/料号/数量/方向/机台号;
- 表格上传批量同步、Excel/CSV 导出;
- 「使用中」状态追踪,清楚知道哪些 dummy 正在被使用;
- 公网部署,任何人通过网址即可访问。

**访问地址**:https://powernexx-dummy.vercel.app
**代码仓库**:https://github.com/WHQ117255/powernexx-dummy

---

## 二、技术架构

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | Vue 3 + Vite | 单页应用,构建产物由 Vercel 托管 |
| 后端 | Express(Serverless) | 通过 `api/[...slug].js` 作为 Vercel 函数入口 |
| 数据库 | Neon(PostgreSQL) | `@neondatabase/serverless`,Serverless 友好的云数据库 |
| 表格解析 | exceljs | 读写 xlsx/csv |
| 部署 | Vercel + GitHub | push 到 main 自动部署 |

**架构图**:

```
浏览器 → Vercel(前端静态 + Serverless 函数) → Neon Postgres(云数据库)
```

---

## 三、核心功能

### 1. 总览看板(首页)
- 顶部「窗口」展示**全部 MBD** 的剩余数量,支持**从低到高 / 从高到低**排序切换;
- KPI 卡片:型号数、总剩余、偏低(≤5)、告急(≤1)、使用中数量;
- 下方按 6 个线径分组展示:**0.7PCC / 0.8PCC / 0.96CU / 1.0PCC / 1.3CU / 2.0CU**;
- 点击某线径模块 → 展开该线径下所有 MBD 的剩余明细。

### 2. 手动更新(消息录入)
支持自然语言消息自动解析:

| 消息示例 | 解析结果 |
|---|---|
| `上来俩条` | 新增 2 条(需补选线径/料号) |
| `来了三条` | 新增 3 条 |
| `拿给7086两条10002220dummy` | 机台 7086 拿走 2 条,料号 10002220 |
| `给成杰10002220俩条dummy` | 拿走 2 条(人名不参与定位) |

- 未识别线径/料号的行,可在预览表格中**手动补选**;
- 支持一次粘贴多行批量解析;
- 手动录入料号可输入**新 MBD 号**(不在本地列表也能新增)。

### 3. 饱嗝趣味提示
更新成功后弹出趣味提示:

| 操作 | 提示语 |
|---|---|
| 新增 1 条 | 怎么只喂这么点dummy |
| 新增 2 条 | 行吧 也就小小满足 |
| 新增 3 条 | 不错知道喂饱我了 |
| 新增 ≥4 条 | 对对对对就这样备 狠狠的备dummy |
| 减少 1 条 | 你注意点昂 省着点用 |
| 减少 2 条 | 要勤俭持家啊啊啊! |
| 减少 ≥3 条 | 当家的 稳重啊啊啊啊! |

### 4. 上传同步(快照覆盖)
- 上传与 dummy.xlsx 同格式的 xlsx/csv(列:Wire Size / MBD / Dummy QTY / Remark);
- 以上传表格为**最新快照**刷新库存,差异自动生成变动记录。

### 5. 导出
- 库存快照 / 变动明细 × xlsx / csv,共 4 种组合。

### 6. 使用中状态
- 「拿给/给」类减少操作 → 该 MBD 标记为**「使用中」**(橙色标签);
- 「上来/来了」类新增操作 → 自动取消使用中;
- 看板、线径详情、历史明细都能看到使用中状态。

---

## 四、消息解析规则

| 识别项 | 规则 |
|---|---|
| 方向 | 增加词:上来/来了/新增/归还/放入…;减少词:拿给/给/拿/取走/消耗… |
| 线径 | 从数据库线径枚举按长度降序、大小写不敏感匹配 |
| 料号(MBD) | 6~9 位连续数字,精确 → 去前导0 → 包含 三级匹配 |
| 数量 | 中文数字(两/俩/三…十)+ 阿拉伯数字,配合「条/个/枚/支/片」量词 |
| 机台号 | 「拿给/给」后紧跟的 1~5 位短数字(如 7086) |

---

## 五、数据库设计(PostgreSQL)

### dummy_items(物料主表)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | 主键 |
| wire_size | TEXT | 线径/型号(如 1.0PCC) |
| mbd | TEXT | 料号(如 10002220) |
| current_qty | INTEGER | 当前剩余数量 |
| in_use | INTEGER | 0=在库,1=使用中 |
| remark | TEXT | 备注(PPF/CUAG 等) |
| created_at / updated_at | TEXT | 时间戳 |

### inventory_transactions(变动明细)
| 字段 | 类型 | 说明 |
|---|---|---|
| id | SERIAL PK | 主键 |
| dummy_item_id | INTEGER FK | 关联物料 |
| change_qty | INTEGER | 变动量(+归还 / -拿走) |
| change_type | TEXT | import/manual/upload/scheduled |
| source_text | TEXT | 原始消息文本 |
| machine | TEXT | 机台号 |
| remark | TEXT | 备注 |
| created_at | TEXT | 时间戳 |

### settings(配置)
`warn_threshold=5`(≤5 偏低)、`danger_threshold=1`(≤1 告急),>5 为充足。

---

## 六、API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/items | 库存列表(?wire_size= 筛选、?q= 搜索料号) |
| GET | /api/stats | 看板 KPI |
| GET | /api/meta | 线径枚举、阈值、按线径分组的料号 |
| POST | /api/parse | 解析消息文本(预览,不落库) |
| POST | /api/update | 手动更新(单条或批量) |
| POST | /api/upload | 上传 xlsx/csv 快照覆盖 |
| GET | /api/export | 导出(type=snapshot/transactions, format=xlsx/csv) |
| GET | /api/transactions | 历史变动明细(分页) |

---

## 七、目录结构

```
powernexx-dummy/
├── api/
│   └── [...slug].js        # Vercel Serverless 函数入口(catch-all)
├── server/
│   ├── app.js              # Express 应用(共用)
│   ├── index.js            # 本地启动入口
│   ├── db.js               # Neon 连接池 + 建表 + 查询辅助
│   ├── store.js            # 库存变动事务操作
│   ├── parser.js           # 消息解析器(核心)
│   ├── importer.js         # xlsx/csv 解析 + 数据导入
│   └── routes/
│       ├── items.js        # 库存/统计/元数据/解析/更新
│       ├── upload.js       # 上传快照覆盖
│       ├── export.js       # 导出
│       └── transactions.js # 历史明细
├── client/                 # 前端 Vue3 + Vite
│   └── src/views/
│       ├── Dashboard.vue   # 总览看板
│       ├── Update.vue      # 手动更新
│       ├── Upload.vue      # 上传同步
│       └── History.vue     # 历史明细
├── scripts/
│   └── seed.js             # 初始化/重置数据脚本
├── dummy.xlsx              # 初始数据源
├── vercel.json             # Vercel 部署配置
├── package.json
└── .env.example            # 环境变量模板(DATABASE_URL)
```

---

## 八、本地开发与部署

### 本地运行
```bash
npm install                 # 安装依赖
$env:DATABASE_URL = "你的 Neon 连接串"
node scripts/seed.js        # 初始化数据(建表 + 导入)
npm run build               # 构建前端
npm start                   # 启动(node server/index.js)
```

### 部署到 Vercel
1. 代码推送到 GitHub;
2. Vercel 导入该仓库;
3. 配置环境变量 `DATABASE_URL`;
4. 自动部署,每次 push 到 main 自动更新。

---

## 九、待办事项

- [ ] 每日 8:00 / 20:00 定时任务(扣减规则待确定后接入 `scheduled_logs` 逻辑)
- [ ] 预警阈值配置界面(当前存于 settings 表,可改库)
- [ ] 绑定自定义域名
