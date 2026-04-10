/**
 * 生成 excel/cards_template.xlsx（卡牌编辑模板）
 * 用法: node scripts/generate-cards-template.js
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT = path.join(__dirname, '../excel/cards_template.xlsx');

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

/** 与 scripts/excel-to-json.js 校验一致的可删示例行 */
const EXAMPLE_ROWS = [
  [
    'pet_example_001',
    '示例·萌宠',
    '实体-萌宠',
    2,
    '可删除本行；复制后改 ID/名称。萌宠填收益、压力、压力上限',
    '普通',
    2,
    1,
    3,
    '相邻牛马效率+10%',
    'dog,cute',
    '',
  ],
  [
    'worker_example_001',
    '示例·牛马',
    '实体-牛马',
    1,
    '牛马可只填收益；压力列可空（默认0）',
    '普通',
    1,
    '',
    '',
    '可献祭',
    'worker',
    '',
  ],
  [
    'action_example_001',
    '示例·指令',
    '指令-减压',
    1,
    '指令/状态卡：收益压力列可留空',
    '稀有',
    '',
    '',
    '',
    '目标萌宠压力归零',
    '',
    '',
  ],
  [
    'status_example_001',
    '示例·状态',
    '状态-负面',
    0,
    '状态-负面示例',
    '普通',
    '',
    '',
    '',
    '',
    'curse',
    '否',
  ],
];

const INFO_SHEET = [
  ['Lovely Pets · 卡牌表模板'],
  [''],
  ['使用方式'],
  ['1. 复制本文件为 excel/cards.xlsx，或清空/替换「卡牌数据」中的示例行后再另存为 cards.xlsx'],
  ['2. 编辑后运行：npm run convert:cards'],
  ['3. 勿改「卡牌数据」第一行列名（须与转换脚本一致）'],
  [''],
  ['必填列'],
  ['ID、名称、类型、费用、描述、稀有度'],
  [''],
  ['类型（须完全一致）'],
  ['实体-萌宠', 'entity_pet'],
  ['实体-牛马', 'entity_worker'],
  ['实体-设施', 'entity_facility'],
  ['指令-增益', 'action_buff'],
  ['指令-减压', 'action_debuff'],
  ['指令-功能', 'action_utility'],
  ['状态-负面', 'status_negative'],
  [''],
  ['稀有度（须完全一致）'],
  ['普通 → common', '稀有 → rare', '史诗 → epic', '传说 → legendary'],
  [''],
  ['可选列'],
  ['收益、压力、压力上限：实体卡；指令/状态可留空'],
  ['特殊效果：自然语言，详见 excel/README.md'],
  ['标签：英文逗号分隔，如 cat,cute'],
  ['可弃牌：填 否 / false / 0 / no 表示不可弃置'],
  [''],
  ['立绘路径'],
  ['转换后自动生成：/assets/cards/{pets|workers|actions|...}/{ID}.svg'],
];

function main() {
  const dir = path.dirname(OUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const wb = XLSX.utils.book_new();

  const data = [HEADERS, ...EXAMPLE_ROWS];
  const wsCards = XLSX.utils.aoa_to_sheet(data);
  wsCards['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 6 },
    { wch: 36 },
    { wch: 8 },
    { wch: 6 },
    { wch: 6 },
    { wch: 10 },
    { wch: 28 },
    { wch: 16 },
    { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCards, '卡牌数据');

  const wsInfo = XLSX.utils.aoa_to_sheet(INFO_SHEET);
  wsInfo['!cols'] = [{ wch: 72 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, '填写说明');

  XLSX.writeFile(wb, OUT);
  console.log('已生成:', OUT);
}

main();
