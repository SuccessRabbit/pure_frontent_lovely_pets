# 图片资源占位符说明

## 当前状态

此目录用于存放游戏的图片资源。当前为空，需要你添加相应的图片文件。

## 卡牌图片规范

### 萌宠卡牌（pets/）

需要的文件：
- `pet_001.png` - 新晋柯基
- `pet_002.png` - 暴躁二哈
- `pet_003.png` - 摸鱼水豚
- `pet_004.png` - 橘猫胖丁
- `pet_005.png` - 高冷布偶
- `pet_006.png` - 永动机猫

**设计要求：**
- 尺寸：200x280px（竖版卡牌）
- 格式：PNG（支持透明背景）
- 风格：卡通、可爱、Q 版
- 内容：萌宠的半身像或全身像，表情生动

### 牛马卡牌（workers/）

需要的文件：
- `worker_001.png` - 实习牛马
- `worker_002.png` - 资深社畜
- `worker_003.png` - 卷王
- `worker_004.png` - 算账小仓鼠
- `worker_005.png` - 投资老狐狸

**设计要求：**
- 尺寸：200x280px
- 格式：PNG
- 风格：与萌宠卡牌统一，但色调偏灰暗
- 内容：工作状态的动物形象

### 指令卡牌（actions/）

需要的文件：
- `action_001.png` - 高级猫薄荷
- `action_002.png` - 画大饼
- `action_003.png` - 物理位移
- `action_004.png` - 全屏打赏
- `action_005.png` - 群体降压
- `action_006.png` - 强制辞退
- `action_007.png` - 盲盒零食
- `action_008.png` - 紧急避险

**设计要求：**
- 尺寸：200x280px
- 格式：PNG
- 风格：图标化，突出道具特征
- 内容：道具的特写或象征性图案

## 临时解决方案

在图片准备好之前，游戏会使用：
1. **纯色背景 + 文字**：根据稀有度显示不同颜色
2. **CSS 渐变**：自动生成的渐变背景
3. **Emoji 占位符**：使用表情符号临时替代

## 图片生成建议

### 使用 AI 工具生成

**Midjourney 提示词示例：**
```
cute corgi character, chibi style, kawaii, pastel colors,
white background, card game illustration, high quality,
digital art --ar 5:7
```

**DALL-E 提示词示例：**
```
A cute cartoon corgi puppy in chibi style, happy expression,
sitting pose, pastel colors, white background,
suitable for card game illustration
```

### 使用免费素材网站

- **Freepik**：搜索 "cute animal cartoon"
- **Flaticon**：搜索 "pet icon"
- **Pixabay**：搜索 "cartoon animal"

### 委托画师

**参考价格（仅供参考）：**
- 单张卡牌插画：50-200 元
- 整套卡牌（20 张）：800-2000 元

## 添加图片后

1. 确保文件名与配置文件中的 ID 一致
2. 检查图片尺寸和格式
3. 刷新浏览器查看效果
4. 如果图片不显示，检查控制台错误信息

## 色彩参考

### 稀有度配色
- **普通（Common）**：灰色 #9CA3AF
- **稀有（Rare）**：蓝色 #60A5FA
- **史诗（Epic）**：紫色 #A78BFA
- **传说（Legendary）**：金色 #FBBF24

### 卡牌类型配色
- **萌宠**：暖色调（粉、橙、黄）
- **牛马**：冷色调（灰、蓝）
- **指令**：鲜艳色（红、绿、紫）

---

**提示：** 你可以先用占位符运行游戏，逐步替换为正式图片。
