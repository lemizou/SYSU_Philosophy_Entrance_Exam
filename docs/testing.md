# 自动测试与验收

## 一键运行

在项目根目录执行：

```powershell
python tests/run_all.py
```

测试入口会依次运行：

1. 题库与中央标签表校验；
2. Python 单元测试和真实题库验收测试；
3. JavaScript 检索、排序、高亮、标签与 URL 状态测试；
4. Chrome 端到端测试。

Chrome 端到端测试会临时启动本地检索服务和无头 Chrome，完成后自动关闭，
不会修改浏览器个人资料。Windows 还会通过 `启动检索.cmd --smoke-test`
验证启动脚本能够启动服务并读取页面和题库。

## 验收覆盖

| 验收项 | 自动测试 |
| --- | --- |
| 单关键词 | `SearchAcceptanceTest.test_keyword_syntax_on_real_data` |
| 多关键词 AND | 同上，使用“康德 先验” |
| OR | 同上，使用“康德 OR 朱熹” |
| 完整短语 | 同上，使用 `"哥白尼转向"` |
| 排除词 | 同上，使用“康德 -黑格尔” |
| 标签别名 | `test_tag_alias_same_category_or_and_cross_category_and` |
| 同类多标签任一匹配 | 同上；同一标签分类固定使用 OR |
| 跨类标签全部满足 | 同上；不同标签分类固定使用 AND |
| 年份、科目、题型组合 | `test_year_subject_section_combination_and_no_result` |
| 年份索引多选与旧年份区间链接兼容 | `url_state_test.js` 和 `browser_e2e_test.js` |
| 全卷概览的筛选、分卷与原始题序 | `full_paper_test.js` 和 `browser_e2e_test.js` |
| 空条件 | `test_all_431_questions_load_and_empty_conditions_return_all` |
| 无结果 | `test_year_subject_section_combination_and_no_result` |
| URL 状态恢复 | `url_state_test.js` 和 `browser_e2e_test.js` |
| 桌面端结果/详情栏调宽 | `browser_e2e_test.js` |
| 移动端结果/详情切换 | `browser_e2e_test.js` |
| 网页与命令行结果一致 | `test_web_engine_and_cli_return_identical_ids` |
| `启动检索.cmd` 正常启动 | `WindowsLauncherTest` |
| 431 道题全部载入 | 数据校验、真实题库验收和 Chrome 端到端测试 |
| 浏览器控制台没有错误 | `browser_e2e_test.js` |

同一分类内的多个标签始终使用 OR；不同分类之间使用 AND。

## 失败排查

- 找不到 Node.js：安装当前维护版 Node.js 后重试。
- 找不到 Chrome/Chromium：安装 Google Chrome，或确保 Chromium 位于系统
  PATH。
- 端口占用：测试会自动选择空闲端口；日常启动可用
  `python src/search_web.py --port 8766` 指定其他端口。
- 仅检查启动器：运行
  `启动检索.cmd --no-browser --port 0 --smoke-test`。

GitHub Actions 使用 `.github/workflows/tests.yml` 执行相同的一键测试。
