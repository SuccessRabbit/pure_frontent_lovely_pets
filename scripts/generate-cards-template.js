/**
 * 从 config/*.json 生成 excel/cards_template.xlsx，与 scripts/excel-to-json.js 列、枚举一致。
 * 用法: node scripts/generate-cards-template.js
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'excel/cards_template.xlsx');

/** 须与 scripts/excel-to-json.js 中 CARD_TYPE_MAP / RARITY_MAP 保持一致 */
const CARD_TYPE_MAP_EXCEL = {
  '实体-萌宠': 'entity_pet',
  '实体-牛马': 'entity_worker',
  '实体-设施': 'entity_facility',
  '指令-增益': 'action_buff',
  '指令-减压': 'action_debuff',
  '指令-功能': 'action_utility',
  '状态-负面': 'status_negative',
};

const RARITY_MAP_EXCEL = {
  普通: 'common',
  稀有: 'rare',
  史诗: 'epic',
  传说: 'legendary',
};

const TYPE_TO_EXCEL = Object.fromEntries(
  Object.entries(CARD_TYPE_MAP_EXCEL).map(([cn, en]) => [en, cn])
);
const RARITY_TO_EXCEL = Object.fromEntries(
  Object.entries(RARITY_MAP_EXCEL).map(([cn, en]) => [en, cn])
);

const HEADERS = [
  'ID',
  '名称',
  '类型',
  '费用',
  '描述',
  '稀有度',
  '收益',
  '压力',
  '压力上限',
  '特殊效果',
  '标签',
  '可弃牌',
];

function loadJson(file) {
  const p = path.join(ROOT, 'config', file);
  if (!fs.existsSync(p)) return [];
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

function effectsToCell(effects) {
  if (!effects?.length) return '';
  return effects
    .map(e => (e.description != null ? e.description : e.raw) || '')
    .filter(Boolean)
    .join('；');
}

function cardToRow(card) {
  const typeCn = TYPE_TO_EXCEL[card.type];
  if (!typeCn) {
    console.warn('跳过未知 type:', card.id, card.type);
    return null;
  }
  const rarityCn = RARITY_TO_EXCEL[card.rarity];
  if (!rarityCn) {
    console.warn('跳过未知 rarity:', card.id, card.rarity);
    return null;
  }

  const isEntity = String(card.type).startsWith('entity_');
  const income = isEntity && card.income !== undefined ? card.income : '';
  const stress = isEntity && card.stress !== undefined ? card.stress : '';
  const stressLimit = isEntity && card.stressLimit !== undefined ? card.stressLimit : '';

  const tags = Array.isArray(card.tags) ? card.tags.join(',') : '';

  let 可弃牌 = '';
  if (card.canDiscard === false) 可弃牌 = '否';

  return [
    card.id,
    card.name,
    typeCn,
    card.cost,
    card.description ?? '',
    rarityCn,
    income,
    stress,
    stressLimit,
    effectsToCell(card.effects),
    tags,
    可弃牌,
  ];
}

const INFO_SHEET = [
  ['Lovely Pets · 卡牌表模板'],
  [''],
  ['数据来源'],
  ['本表由 npm run generate:cards-template 根据以下文件生成，与游戏内配置一致：'],
  ['config/pets.json、config/workers.json、config/actions.json'],
  [''],
  ['使用方式'],
  ['1. 编辑后另存为 excel/cards.xlsx（或复制本表内容到 cards.xlsx）'],
  ['2. 运行 npm run convert:cards 写回 config 与类型定义'],
  ['3. 勿改「卡牌数据」第一行列名'],
  [''],
  ['必填列'],
  ['ID、名称、类型、费用、描述、稀有度'],
  [''],
  ['类型（须与 excel-to-json.js 完全一致）'],
  ['实体-萌宠', 'entity_pet'],
  ['实体-牛马', 'entity_worker'],
  ['实体-设施', 'entity_facility'],
  ['指令-增益', 'action_buff'],
  ['指令-减压', 'action_debuff'],
  ['指令-功能', 'action_utility'],
  ['状态-负面', 'status_negative'],
  [''],
  ['稀有度'],
  ['普通 | 稀有 | 史诗 | 传说'],
  [''],
  ['实体卡'],
  ['收益、压力、压力上限：与 JSON 中 income / stress / stressLimit 对应；牛马压力上限可为 0'],
  [''],
  ['立绘'],
  ['转换时自动生成路径：/assets/cards/{pets|workers|actions|facilities}/{ID}.svg'],
];

function main() {
  const pets = loadJson('pets.json');
  const workers = loadJson('workers.json');
  const actions = loadJson('actions.json');

  const rows = [];
  for (const c of pets) {
    const r = cardToRow(c);
    if (r) rows.push(r);
  }
  for (const c of workers) {
    const r = cardToRow(c);
    if (r) rows.push(r);
  }
  for (const c of actions) {
    const r = cardToRow(c);
    if (r) rows.push(r);
  }

  const dir = path.dirname(OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wb = XLSX.utils.book_new();
  const data = [HEADERS, ...rows];
  const wsCards = XLSX.utils.aoa_to_sheet(data);
  wsCards['!cols'] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 12 },
    { wch: 6 },
    { wch: 40 },
    { wch: 8 },
    { wch: 6 },
    { wch: 6 },
    { wch: 10 },
    { wch: 44 },
    { wch: 22 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCards, '卡牌数据');

  const wsInfo = XLSX.utils.aoa_to_sheet(INFO_SHEET);
  wsInfo['!cols'] = [{ wch: 76 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '填写说明');

  XLSX.writeFile(wb, OUT);
  console.log(
    '已生成:',
    OUT,
    `（萌宠 ${pets.length}、牛马 ${workers.length}、指令/其它 ${actions.length}，共 ${rows.length} 行）`
  );
}

main();
