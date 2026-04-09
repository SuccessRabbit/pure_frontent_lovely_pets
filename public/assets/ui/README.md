# UI 图标资源说明

## 需要的图标

### 资源图标（icons/）

必需的图标文件：

1. **can.png** - 小罐头图标
   - 尺寸：64x64px
   - 用途：显示玩家的货币数量
   - 建议：罐头的侧视图，简洁明了

2. **heart.png** - 小红心图标
   - 尺寸：64x64px
   - 用途：显示分数/生命值
   - 建议：爱心形状，填充红色

3. **star.png** - 星星图标
   - 尺寸：64x64px
   - 用途：显示评分、成就
   - 建议：五角星，金色

4. **stress.png** - 压力图标
   - 尺寸：64x64px
   - 用途：压力条旁边的提示图标
   - 建议：汗滴、温度计或爆炸符号

5. **coin.png** - 金币图标
   - 尺寸：64x64px
   - 用途：利息、额外收益提示
   - 建议：金币侧视图

### 按钮素材（buttons/）

可选的按钮背景：
- `button-primary.png` - 主要按钮
- `button-secondary.png` - 次要按钮
- `button-danger.png` - 危险操作按钮

**注：** 如果不提供，将使用 CSS 样式生成按钮

### 背景图（backgrounds/）

可选的背景素材：
- `game-bg.jpg` - 游戏主背景
- `panel-bg.png` - 面板背景纹理
- `grid-bg.png` - 网格区域背景

## 临时方案

在图片准备好之前，使用：
- **Emoji**：🥫（罐头）、❤️（红心）、⭐（星星）
- **Unicode 符号**：♥ ★ ◆ ●
- **纯色圆形**：CSS 生成的简单图标

## 图标风格建议

- **扁平化设计**：简洁、现代
- **描边风格**：线条清晰，易于识别
- **卡通风格**：与游戏整体风格统一
- **高对比度**：在深色背景上清晰可见

## 免费图标资源

- **Flaticon**：https://www.flaticon.com/
- **Icons8**：https://icons8.com/
- **Font Awesome**：https://fontawesome.com/（可用 SVG）
- **Material Icons**：https://fonts.google.com/icons

## 使用 SVG 替代

你也可以使用 SVG 格式的图标，优势：
- 矢量图，任意缩放不失真
- 文件体积小
- 可以通过 CSS 改变颜色

将 SVG 文件放在同一目录，或直接在代码中内联使用。
