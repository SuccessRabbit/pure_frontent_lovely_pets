/**
 * Excel 卡牌配置转 JSON 脚本
 * 使用方法：node scripts/excel-to-json.js
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置路径
const EXCEL_PATH = path.join(__dirname, '../excel/cards.xlsx');
const OUTPUT_DIR = path.join(__dirname, '../config');
const TYPES_OUTPUT = path.join(__dirname, '../src/types/cards.generated.ts');

// 卡牌类型映射
const CARD_TYPE_MAP = {
  '实体-萌宠': 'entity_pet',
  '实体-牛马': 'entity_worker',
  '实体-设施': 'entity_facility',
  '指令-增益': 'action_buff',
  '指令-减压': 'action_debuff',
  '指令-功能': 'action_utility',
  '状态-负面': 'status_negative'
};

const RARITY_MAP = {
  '普通': 'common',
  '稀有': 'rare',
  '史诗': 'epic',
  '传说': 'legendary'
};

/** 与 public/assets/cards 下子目录一致；指令类统一进 actions（修复原先 split 成 buff/debuff 目录的错误） */
function cardImageFolder(cardType) {
  if (cardType === 'entity_pet') return 'pets';
  if (cardType === 'entity_worker') return 'workers';
  if (cardType.startsWith('action_')) return 'actions';
  if (cardType === 'entity_facility') return 'facilities';
  return 'actions';
}

/**
 * Excel 中也可增加一行与之下完全一致；若表内无此 ID，转换时会自动并入 actions.json
 * 列示例：… | 可弃牌=否（可选，否/false/0 → canDiscard false）
 */
const POST_MERGE_ACTION_CARDS = [
  {
    id: 'action_resentment',
    name: '怨气卡',
    type: 'action_debuff',
    cost: 0,
    rarity: 'common',
    canDiscard: false,
    description: '打出不消耗罐头，不可弃置只能打出；打出时全场萌宠压力+2',
    image: '/assets/cards/actions/action_resentment.svg',
    tags: ['curse'],
    effects: [{ type: 'raw', description: '打出时：全场萌宠压力+2' }]
  }
];

/**
 * 读取 Excel 文件
 */
function readExcel(filePath) {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    return data;
  } catch (error) {
    console.error(`❌ 读取 Excel 文件失败: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 验证必填字段
 */
function validateRow(row, index) {
  const required = ['ID', '名称', '类型', '费用', '描述', '稀有度'];
  const missing = required.filter(field => row[field] === undefined || row[field] === null);

  if (missing.length > 0) {
    console.error(`❌ 第 ${index + 2} 行缺少必填字段: ${missing.join(', ')}`);
    return false;
  }

  // 验证类型
  if (!CARD_TYPE_MAP[row['类型']]) {
    console.error(`❌ 第 ${index + 2} 行类型无效: ${row['类型']}`);
    return false;
  }

  // 验证稀有度
  if (!RARITY_MAP[row['稀有度']]) {
    console.error(`❌ 第 ${index + 2} 行稀有度无效: ${row['稀有度']}`);
    return false;
  }

  // 验证数值
  if (isNaN(row['费用']) || row['费用'] < 0) {
    console.error(`❌ 第 ${index + 2} 行费用必须是非负数`);
    return false;
  }

  return true;
}

/**
 * 转换单行数据
 */
function transformRow(row) {
  const type = CARD_TYPE_MAP[row['类型']];
  const card = {
    id: row['ID'].toString().trim(),
    name: row['名称'].trim(),
    type,
    cost: parseInt(row['费用'], 10),
    rarity: RARITY_MAP[row['稀有度']],
    description: row['描述'].trim(),
    image: `/assets/cards/${cardImageFolder(type)}/${row['ID']}.svg`,
    tags: row['标签'] ? row['标签'].split(',').map(t => t.trim()) : []
  };

  // 实体卡专属字段
  if (card.type.startsWith('entity_')) {
    card.income = parseInt(row['收益'] || 0);
    card.stress = parseInt(row['压力'] || 0);
    card.stressLimit = parseInt(row['压力上限'] || 3);
  }

  // 特殊效果
  if (row['特殊效果']) {
    card.effects = parseEffects(row['特殊效果']);
  }

  // 可弃牌：列「可弃牌」为 否 / false / 0 时写入 canDiscard: false；默认可弃不写
  const discardCol = row['可弃牌'];
  if (discardCol !== undefined && discardCol !== null && String(discardCol).trim() !== '') {
    const v = String(discardCol).trim().toLowerCase();
    if (v === '否' || v === 'false' || v === '0' || v === 'no') {
      card.canDiscard = false;
    }
  }

  return card;
}

/**
 * 解析特殊效果字符串
 */
function parseEffects(effectStr) {
  const effects = [];
  const patterns = [
    // 相邻增益：相邻牛马效率+10%
    /相邻(\S+)(效率|收益|压力)([+\-]\d+)%?/g,
    // 全局效果：全场压力-1
    /全场(\S+)([+\-]\d+)/g,
    // 条件效果：压力>2时收益翻倍
    /(\S+)>(\d+)时(\S+)([+\-×]\d+)/g
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(effectStr)) !== null) {
      effects.push({
        type: 'parsed',
        raw: match[0],
        // 这里可以进一步结构化，暂时保留原始文本
      });
    }
  });

  // 如果没有匹配到模式，保留原始文本
  if (effects.length === 0 && effectStr.trim()) {
    effects.push({
      type: 'raw',
      description: effectStr.trim()
    });
  }

  return effects;
}

/**
 * 按类型分组卡牌
 */
function groupByType(cards) {
  const groups = {
    pets: [],
    workers: [],
    facilities: [],
    actions: [],
    statuses: []
  };

  cards.forEach(card => {
    if (card.type === 'entity_pet') groups.pets.push(card);
    else if (card.type === 'entity_worker') groups.workers.push(card);
    else if (card.type === 'entity_facility') groups.facilities.push(card);
    else if (card.type.startsWith('action_')) groups.actions.push(card);
    else if (card.type === 'status_negative') groups.statuses.push(card);
  });

  return groups;
}

/**
 * 生成 TypeScript 类型定义
 */
function generateTypes(cards) {
  const cardIds = cards.map(c => `'${c.id}'`).join(' | ');
  const types = `/**
 * 自动生成的卡牌类型定义
 * 请勿手动修改此文件
 * 生成时间: ${new Date().toISOString()}
 */

export type CardType =
  | 'entity_pet'
  | 'entity_worker'
  | 'entity_facility'
  | 'action_buff'
  | 'action_debuff'
  | 'action_utility'
  | 'status_negative';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type CardId = ${cardIds};

export interface CardEffect {
  type: string;
  raw?: string;
  description?: string;
  [key: string]: any;
}

export interface Card {
  id: CardId;
  name: string;
  type: CardType;
  cost: number;
  rarity: Rarity;
  description: string;
  image: string;
  tags: string[];

  // 实体卡专属
  income?: number;
  stress?: number;
  stressLimit?: number;

  // 效果
  effects?: CardEffect[];
}

export interface CardDatabase {
  pets: Card[];
  workers: Card[];
  facilities: Card[];
  actions: Card[];
  statuses: Card[];
  all: Card[];
}
`;

  return types;
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始转换 Excel 配置...\n');

  // 检查 Excel 文件是否存在
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`❌ Excel 文件不存在: ${EXCEL_PATH}`);
    console.log('💡 请先创建 excel/cards.xlsx 文件');
    process.exit(1);
  }

  // 读取 Excel
  console.log('📖 读取 Excel 文件...');
  const rows = readExcel(EXCEL_PATH);
  console.log(`✅ 读取到 ${rows.length} 行数据\n`);

  // 验证和转换
  console.log('🔍 验证数据...');
  const cards = [];
  let errorCount = 0;

  rows.forEach((row, index) => {
    if (validateRow(row, index)) {
      cards.push(transformRow(row));
    } else {
      errorCount++;
    }
  });

  if (errorCount > 0) {
    console.error(`\n❌ 发现 ${errorCount} 个错误，请修复后重试`);
    process.exit(1);
  }

  console.log(`✅ 验证通过，共 ${cards.length} 张卡牌\n`);

  // 按类型分组
  const groups = groupByType(cards);

  let mergedActionCount = 0;
  POST_MERGE_ACTION_CARDS.forEach(extra => {
    if (!groups.actions.some(c => c.id === extra.id)) {
      groups.actions.push({ ...extra });
      mergedActionCount++;
    }
  });
  if (mergedActionCount > 0) {
    console.log(`📎 已自动并入指令牌（Excel 无对应行）: ${mergedActionCount} 张\n`);
  }

  const augments = POST_MERGE_ACTION_CARDS.filter(e => !cards.some(c => c.id === e.id));
  const fullCardList = [...cards, ...augments];

  console.log('📊 卡牌分布:');
  console.log(`   - 萌宠: ${groups.pets.length} 张`);
  console.log(`   - 牛马: ${groups.workers.length} 张`);
  console.log(`   - 设施: ${groups.facilities.length} 张`);
  console.log(`   - 指令: ${groups.actions.length} 张`);
  console.log(`   - 状态: ${groups.statuses.length} 张\n`);

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 写入 JSON 文件
  console.log('💾 生成配置文件...');

  // 分类输出
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'pets.json'),
    JSON.stringify(groups.pets, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'workers.json'),
    JSON.stringify(groups.workers, null, 2)
  );
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'actions.json'),
    JSON.stringify(groups.actions, null, 2)
  );

  // 完整输出（含自动并入的指令牌，与 actions.json 一致）
  const database = {
    ...groups,
    all: fullCardList
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'cards.json'),
    JSON.stringify(database, null, 2)
  );

  console.log(`✅ 配置文件已生成到 ${OUTPUT_DIR}\n`);

  // 生成 TypeScript 类型
  console.log('📝 生成 TypeScript 类型定义...');
  const typesDir = path.dirname(TYPES_OUTPUT);
  if (!fs.existsSync(typesDir)) {
    fs.mkdirSync(typesDir, { recursive: true });
  }
  fs.writeFileSync(TYPES_OUTPUT, generateTypes(fullCardList));
  console.log(`✅ 类型定义已生成到 ${TYPES_OUTPUT}\n`);

  // 生成统计报告
  console.log('📈 统计报告:');
  const rarityCount = cards.reduce((acc, card) => {
    acc[card.rarity] = (acc[card.rarity] || 0) + 1;
    return acc;
  }, {});

  Object.entries(rarityCount).forEach(([rarity, count]) => {
    console.log(`   - ${rarity}: ${count} 张`);
  });

  console.log('\n✨ 转换完成！');
}

// 执行
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { readExcel, transformRow, validateRow, cardImageFolder, POST_MERGE_ACTION_CARDS };
