# CSV Data Sets

本目录是当前游戏配置的唯一源数据。

- `cards.csv`: 卡牌基础字段、2D 资源路径、3D 模型绑定
- `card_skills.csv`: 卡牌与技能模板的绑定实例
- `skill_templates.csv`: 技能模板定义与参数 schema
- `model_profiles.csv`: 宠物 3D 模型 preset 与变换参数
- `global_config.csv`: 全局游戏参数

本地开发推荐通过 `/admin` 编辑这些 CSV。
构建前会自动运行 `npm run compile:data`，生成 `config/*.json`、`config/runtimeConfig.json` 和 `config/gameRules.ts`。
