# Supabase 第一版后端

本阶段只建立后端，不加载 Supabase JavaScript 客户端，也不改变现有网页。题目内容
仍以 `data/questions.json` 为唯一来源；后端仅用稳定的 `question_id` 关联用户数据。

远程项目已部署到 Supabase 东京区域，项目 URL 为
`https://vplsugmumjpfjhyhhsvo.supabase.co`。邮箱登录、生产站点地址和本地回调地址
均已配置。Security Advisor 当前为 0 个错误；保留的 3 个警告均为下文说明的受控
RPC。

## 第一版范围

- Supabase Auth 邮箱验证码或 Magic Link 登录；
- 收藏题目；
- 私人笔记与自动保存；
- 收藏/笔记筛选所需的题目 ID；
- 最近浏览；
- 用户页基本统计；
- 管理员 DAU、滚动 7 日 WAU、滚动 30 日 MAU；
- 笔记 JSON/CSV 导出所需的结构化数据。

不在第一版收集公开资料、详细点击流水、设备指纹或 IP 地址。活跃统计只保留每位
用户每天一行，以 UTC 日期为准。

## 安全边界

`favorites`、`notes`、`recent_views` 和 `daily_user_activity` 均启用 RLS。用户只能
访问自己的记录。最近浏览和活跃记录只能经 RPC 写入，时间戳由数据库生成。

浏览器以后只能使用 publishable key。`sb_secret_*`、`service_role`、数据库密码和
访问令牌不得放入网页、仓库、GitHub Actions 日志或 GitHub Pages。

管理员由 `private.admin_users` 白名单确定。该表不暴露给 Data API。创建管理员前，
管理员必须先通过正常邮箱登录产生 `auth.users` 记录，然后在 Supabase SQL Editor 中
执行：

```sql
insert into private.admin_users (user_id)
select id from auth.users where email = 'ADMIN_EMAIL';
```

不要把真实管理员邮箱写进 migration。

## 远程部署

1. 在 Supabase 创建项目，保存项目数据库密码到密码管理器。
2. 在 Authentication URL Configuration 中设置：
   - Site URL：`https://lemizou.github.io/SYSU_Philosophy_Entrance_Exam/`
   - Redirect URL：`https://lemizou.github.io/SYSU_Philosophy_Entrance_Exam/**`
   - 本地开发：`http://127.0.0.1:8765/**`
3. 启用 Email provider。第一版优先验证码或 Magic Link，不接入第三方 OAuth。
4. 在 SQL Editor 执行 `supabase/migrations/202608110001_initial_user_backend.sql`。
5. 在一次性或测试项目中执行 `supabase/tests/security_smoke.sql`。
6. 查看 Security Advisor，确认没有未启用 RLS 的公开表或危险函数授权。

Security Advisor 会提示三个登录用户可执行的 `security definer` RPC：
`record_recent_view`、`record_activity` 和 `get_activity_metrics`。这是预期设计；前两个
函数只写入 `auth.uid()` 对应的行，管理员统计函数在查询前检查私有管理员白名单，且
三个函数都固定了空 `search_path`。它们不对 `anon` 或 `public` 开放。

第二个 migration 会在项目存在 `public.rls_auto_enable()` 时撤销其 Data API 执行权限，
但不影响数据库事件触发器以函数所有者身份运行。

如以后安装 Supabase CLI，可改用 migration push；SQL migration 本身不依赖 CLI。

## 前端调用契约

以下仅定义下一阶段的调用方式，本阶段不修改前端。

### 收藏

- 添加：向 `favorites` 插入 `{ user_id, question_id }`。
- 取消：按当前用户和 `question_id` 删除。
- 筛选：读取当前用户的 `question_id` 列表，与本地题库取交集。

收藏表主键保证重复添加是确定性的。前端可使用 `upsert` 并指定
`onConflict: 'user_id,question_id'`。

### 笔记自动保存

- 非空内容：按 `user_id + question_id` upsert `notes`。
- 清空内容：删除对应记录。
- 建议前端在最后一次输入后 600—1000ms 保存，并在切换题目或页面隐藏时刷新待保存
  内容。
- 单篇笔记上限为 50,000 个字符。

### 最近浏览

调用 `record_recent_view(p_question_id)`。数据库维护浏览次数和服务端时间，不允许
浏览器伪造 `last_viewed_at`。

### 活跃记录

登录成功及产生收藏、笔记、浏览或用户页访问时调用 `record_activity()`。同一天只保留
一行，并且 15 分钟内重复调用不会更新数据库。

### 用户统计与导出

- `get_my_stats()`：收藏数、笔记数、最近浏览数、累计活跃天数、最后活动时间。
- `export_my_notes()`：返回当前用户全部笔记。前端再用 `question_id` 合并本地题干、
  年份和科目，生成 JSON 或 CSV。

### 管理员活跃统计

白名单管理员调用 `get_activity_metrics(p_reference_date)`。普通用户调用会收到权限错误。
返回 DAU、截至参考日的滚动 7 日 WAU 和滚动 30 日 MAU。

## 删除账号

所有用户表都以 `auth.users(id)` 为外键并设置 `on delete cascade`。后续实现删除账号时，
删除 Auth 用户会同步删除其收藏、笔记、最近浏览和每日活跃记录。
