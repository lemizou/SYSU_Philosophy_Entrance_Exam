# 个人档案第一版实施计划

## 目标

在不改变 GitHub Pages 静态托管方式的前提下，为真题检索站增加一个“个人档案”页面。用户登录后可以收藏题目、撰写私人笔记、查看最近浏览记录；站点管理员可以在 Supabase 后台查看注册与活跃用户的聚合统计。

第一版以“轻量个人备考档案”为边界，不加入公开主页、社交、评论、排行榜、AI 作答或复杂的间隔重复算法。

## 交付阶段

### A. 前端原型（本次）

- 新增 `web/user.html`、`web/user.css`、`web/user.js`。
- 在真题检索、考点统计之后增加“用户”导航。
- 使用模拟数据呈现个人概览、收藏、笔记、最近浏览和数据导出。
- 验证桌面与移动端布局、键盘焦点、空状态和减少动态效果偏好。

### B. Supabase 基础设施

- 创建 Supabase 项目，配置 GitHub Pages 正式域名和本地开发重定向地址。
- 创建 `favorites`、`notes`、`question_activity`、`daily_activity` 数据表。
- 所有暴露表启用 RLS，只允许 `auth.uid() = user_id` 的用户读取和修改自己的数据。
- 浏览器只使用 Supabase publishable key；secret/service-role key 不进入仓库和网页。
- 配置生产用 SMTP，或选择合适的 OAuth 登录方式。

### C. 登录与题目联动

- 将模拟用户状态替换为 Supabase Auth 会话。
- 在真题详情中加入收藏按钮和笔记侧栏。
- 收藏、笔记使用题库中的稳定 `question_id` 关联，不复制题目正文。
- 未登录用户仍可完整使用检索和统计；触发个人功能时再邀请登录。
- 笔记输入采用 600–900ms 防抖自动保存，并明确显示保存状态。

### D. 个人档案真实数据

- 用户页加载个人收藏、笔记和最近浏览。
- 支持按关键词、科目和类型筛选，支持从用户页跳回对应题目。
- 提供 JSON/Markdown 数据导出以及账户删除入口。
- 记录每日一次或限频的活跃事件，避免每次滚动都写数据库。

### E. 管理统计与上线

- Supabase 后台查看注册总数和 Auth MAU。
- 创建仅管理员可调用的聚合查询，统计 DAU、WAU、收藏用户数、笔记用户数；不展示私人笔记正文。
- 增加 CAPTCHA、速率限制、错误与离线状态处理。
- 完成 RLS 越权测试、跨设备登录测试、移动端验收和隐私说明后上线。

## 建议数据模型

```sql
favorites(
  user_id uuid,
  question_id text,
  created_at timestamptz,
  primary key (user_id, question_id)
)

notes(
  user_id uuid,
  question_id text,
  content text,
  updated_at timestamptz,
  primary key (user_id, question_id)
)

question_activity(
  user_id uuid,
  question_id text,
  last_viewed_at timestamptz,
  view_count integer,
  primary key (user_id, question_id)
)

daily_activity(
  user_id uuid,
  activity_date date,
  action_count integer,
  primary key (user_id, activity_date)
)
```

## 验收标准

- 用户 A 无法读取、修改或删除用户 B 的任何收藏、笔记和活动记录。
- 登录状态刷新后可恢复；退出后不残留私人内容。
- 收藏状态在检索页与用户页一致。
- 笔记自动保存有“保存中 / 已保存 / 保存失败”三种明确状态。
- 用户可以导出并删除自己的数据。
- 管理员统计只返回聚合结果，不依赖前端隐藏来保护管理权限。
- 360px 宽度下页面无横向溢出，所有交互可用键盘完成。
