import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');

const petDefs = [
  {
    id: 'pet_007',
    name: '夜班猫头鹰',
    bg: '#EEF2FF',
    primary: '#7C6A5C',
    accent: '#F3E5D0',
    secondary: '#FFD166',
    ear: 'feather',
    tail: 'fan',
    accessory: 'moon_headset',
  },
  {
    id: 'pet_008',
    name: '摇滚鹦鹉',
    bg: '#FFF1F0',
    primary: '#25A18E',
    accent: '#FFE066',
    secondary: '#FF6B6B',
    ear: 'crest',
    tail: 'plume',
    accessory: 'guitar',
  },
  {
    id: 'pet_009',
    name: 'KPI海狸',
    bg: '#FFF7E8',
    primary: '#A47148',
    accent: '#F3DFC1',
    secondary: '#5DA271',
    ear: 'round',
    tail: 'paddle',
    accessory: 'clipboard',
  },
  {
    id: 'pet_010',
    name: '摆烂树懒',
    bg: '#F4F1EA',
    primary: '#B08D74',
    accent: '#EAD7C3',
    secondary: '#8BC6A2',
    ear: 'round',
    tail: 'nub',
    accessory: 'leaf_pillow',
  },
  {
    id: 'pet_011',
    name: '打卡柴犬',
    bg: '#FFF3E4',
    primary: '#E58A3A',
    accent: '#FFF8F2',
    secondary: '#3F88C5',
    ear: 'pointy',
    tail: 'curl',
    accessory: 'badge',
  },
  {
    id: 'pet_012',
    name: '热搜兔',
    bg: '#FFF0F7',
    primary: '#F6F1F8',
    accent: '#FFD6E7',
    secondary: '#FF4D8D',
    ear: 'long',
    tail: 'puff',
    accessory: 'megaphone',
  },
  {
    id: 'pet_013',
    name: '危机公关狐獴',
    bg: '#FDF6E8',
    primary: '#C89B6A',
    accent: '#F7E2C8',
    secondary: '#5B7CFA',
    ear: 'pointy',
    tail: 'ring',
    accessory: 'mic',
  },
  {
    id: 'pet_014',
    name: '奶茶熊猫',
    bg: '#F7F2E9',
    primary: '#2F2E41',
    accent: '#FFF7E8',
    secondary: '#C08A5B',
    ear: 'round',
    tail: 'puff',
    accessory: 'bubble_tea',
  },
];

const workerDefs = [
  {
    id: 'worker_006',
    name: '加班企鹅',
    bg: '#EEF5FF',
    primary: '#2B2D42',
    accent: '#F8FAFC',
    secondary: '#5B8DEF',
    ear: 'none',
    tail: 'none',
    accessory: 'laptop',
  },
  {
    id: 'worker_007',
    name: '数据水獭',
    bg: '#EAF8F4',
    primary: '#8B6B4F',
    accent: '#EFDCC5',
    secondary: '#14B8A6',
    ear: 'round',
    tail: 'plume',
    accessory: 'chart',
  },
  {
    id: 'worker_008',
    name: '法务獒犬',
    bg: '#F6F0EA',
    primary: '#8A5B3D',
    accent: '#F5E6D3',
    secondary: '#7C3AED',
    ear: 'flop',
    tail: 'nub',
    accessory: 'gavel',
  },
  {
    id: 'worker_009',
    name: '后勤河狸',
    bg: '#F6F1E8',
    primary: '#8B6B4A',
    accent: '#EED9BF',
    secondary: '#6C9F4A',
    ear: 'round',
    tail: 'paddle',
    accessory: 'crate',
  },
];

const actionDefs = [
  {
    id: 'action_009',
    name: '集体摸鱼',
    bg: '#EAF8F4',
    primary: '#14B8A6',
    accent: '#7DD3C7',
    secondary: '#FFE08A',
    motif: 'hammock',
  },
  {
    id: 'action_010',
    name: '热搜投放',
    bg: '#FFF2F2',
    primary: '#FF5D73',
    accent: '#FFD166',
    secondary: '#5B7CFA',
    motif: 'megaphone',
  },
  {
    id: 'action_011',
    name: '人事补招',
    bg: '#F4F1FF',
    primary: '#7C3AED',
    accent: '#C4B5FD',
    secondary: '#34D399',
    motif: 'resume_stack',
  },
  {
    id: 'action_012',
    name: '外包止损',
    bg: '#FFF6E8',
    primary: '#C67C2E',
    accent: '#E9B872',
    secondary: '#334155',
    motif: 'shield_briefcase',
  },
];

function writeAsset(relativePath, content) {
  const outputPath = path.join(ASSETS_DIR, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${content}\n`, 'utf8');
}

function petals(cx, cy, radius, color, count = 5) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    out += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${(radius * 0.56).toFixed(2)}" fill="${color}" opacity="0.72"/>`;
  }
  return out;
}

function renderEar(type, side, scale, primary, accent) {
  const sign = side === 'left' ? -1 : 1;
  const x = 100 + sign * 30 * scale;
  const innerX = 100 + sign * 28 * scale;
  if (type === 'none') return '';
  if (type === 'round') {
    return `<circle cx="${x}" cy="${90 * scale}" r="${11 * scale}" fill="${primary}"/><circle cx="${innerX}" cy="${90 * scale}" r="${6 * scale}" fill="${accent}" opacity="0.82"/>`;
  }
  if (type === 'long') {
    return `<ellipse cx="${x}" cy="${94 * scale}" rx="${9 * scale}" ry="${24 * scale}" fill="${primary}" transform="rotate(${sign * 10} ${x} ${94 * scale})"/><ellipse cx="${x}" cy="${98 * scale}" rx="${5 * scale}" ry="${18 * scale}" fill="${accent}" opacity="0.82" transform="rotate(${sign * 10} ${x} ${98 * scale})"/>`;
  }
  if (type === 'flop') {
    return `<ellipse cx="${x}" cy="${98 * scale}" rx="${12 * scale}" ry="${21 * scale}" fill="${primary}" transform="rotate(${sign * 24} ${x} ${98 * scale})"/><ellipse cx="${x}" cy="${102 * scale}" rx="${6 * scale}" ry="${13 * scale}" fill="${accent}" opacity="0.82" transform="rotate(${sign * 24} ${x} ${102 * scale})"/>`;
  }
  if (type === 'crest') {
    return `<path d="M ${x} ${80 * scale} L ${100 + sign * 20 * scale} ${56 * scale} L ${100 + sign * 8 * scale} ${88 * scale} Z" fill="${primary}"/><circle cx="${100 + sign * 18 * scale}" cy="${66 * scale}" r="${5 * scale}" fill="${accent}" opacity="0.8"/>`;
  }
  if (type === 'feather') {
    return `<path d="M ${x} ${94 * scale} Q ${100 + sign * 45 * scale} ${66 * scale} ${100 + sign * 18 * scale} ${54 * scale} Q ${100 + sign * 10 * scale} ${72 * scale} ${100 + sign * 10 * scale} ${92 * scale} Z" fill="${primary}"/><path d="M ${100 + sign * 18 * scale} ${63 * scale} Q ${100 + sign * 26 * scale} ${75 * scale} ${100 + sign * 15 * scale} ${92 * scale}" stroke="${accent}" stroke-width="${3 * scale}" fill="none" opacity="0.82"/>`;
  }
  return `<path d="M ${x} ${86 * scale} L ${100 + sign * 42 * scale} ${62 * scale} L ${100 + sign * 18 * scale} ${94 * scale} Z" fill="${primary}"/><path d="M ${x} ${90 * scale} L ${100 + sign * 34 * scale} ${72 * scale} L ${100 + sign * 16 * scale} ${96 * scale} Z" fill="${accent}" opacity="0.82"/>`;
}

function renderTail(type, scale, primary, accent) {
  if (type === 'none') return '';
  if (type === 'paddle') {
    return `<ellipse cx="${140 * scale}" cy="${188 * scale}" rx="${15 * scale}" ry="${28 * scale}" fill="${primary}" transform="rotate(24 ${140 * scale} ${188 * scale})"/><line x1="${127 * scale}" y1="${177 * scale}" x2="${118 * scale}" y2="${164 * scale}" stroke="${primary}" stroke-width="${5 * scale}" stroke-linecap="round"/>`;
  }
  if (type === 'curl') {
    return `<path d="M ${136 * scale} ${172 * scale} Q ${158 * scale} ${168 * scale} ${154 * scale} ${190 * scale} Q ${148 * scale} ${205 * scale} ${132 * scale} ${196 * scale}" stroke="${primary}" stroke-width="${6 * scale}" fill="none" stroke-linecap="round"/><circle cx="${150 * scale}" cy="${190 * scale}" r="${7 * scale}" fill="${accent}" opacity="0.9"/>`;
  }
  if (type === 'fan') {
    return `<path d="M ${132 * scale} ${176 * scale} Q ${155 * scale} ${156 * scale} ${168 * scale} ${180 * scale} Q ${155 * scale} ${190 * scale} ${136 * scale} ${198 * scale} Z" fill="${primary}"/><path d="M ${138 * scale} ${181 * scale} Q ${150 * scale} ${172 * scale} ${160 * scale} ${178}" stroke="${accent}" stroke-width="${3 * scale}" fill="none"/>`;
  }
  if (type === 'plume') {
    return `<ellipse cx="${145 * scale}" cy="${186 * scale}" rx="${15 * scale}" ry="${34 * scale}" fill="${primary}" transform="rotate(28 ${145 * scale} ${186 * scale})"/><ellipse cx="${148 * scale}" cy="${192 * scale}" rx="${10 * scale}" ry="${24 * scale}" fill="${accent}" opacity="0.85" transform="rotate(28 ${148 * scale} ${192 * scale})"/>`;
  }
  if (type === 'ring') {
    return `<path d="M ${136 * scale} ${175 * scale} Q ${158 * scale} ${170 * scale} ${164 * scale} ${188 * scale} Q ${160 * scale} ${206 * scale} ${142 * scale} ${204 * scale}" stroke="${primary}" stroke-width="${6 * scale}" fill="none" stroke-linecap="round"/><path d="M ${145 * scale} ${182 * scale} Q ${155 * scale} ${186 * scale} ${149 * scale} ${196 * scale}" stroke="${accent}" stroke-width="${4 * scale}" fill="none" stroke-linecap="round"/>`;
  }
  if (type === 'puff') {
    return `<circle cx="${142 * scale}" cy="${192 * scale}" r="${14 * scale}" fill="${primary}"/><circle cx="${153 * scale}" cy="${185 * scale}" r="${10 * scale}" fill="${accent}" opacity="0.82"/>`;
  }
  return `<circle cx="${138 * scale}" cy="${188 * scale}" r="${8 * scale}" fill="${primary}"/>`;
}

function renderAccessory(type, scale, secondary, accent) {
  if (type === 'moon_headset') {
    return `<path d="M ${72 * scale} ${110 * scale} Q ${100 * scale} ${72 * scale} ${128 * scale} ${110 * scale}" stroke="${secondary}" stroke-width="${5 * scale}" fill="none"/><rect x="${62 * scale}" y="${108 * scale}" width="${12 * scale}" height="${18 * scale}" rx="${4 * scale}" fill="${secondary}"/><rect x="${126 * scale}" y="${108 * scale}" width="${12 * scale}" height="${18 * scale}" rx="${4 * scale}" fill="${secondary}"/><circle cx="${138 * scale}" cy="${92 * scale}" r="${6 * scale}" fill="${accent}" opacity="0.9"/>`;
  }
  if (type === 'guitar') {
    return `<ellipse cx="${138 * scale}" cy="${175 * scale}" rx="${10 * scale}" ry="${14 * scale}" fill="${secondary}"/><rect x="${130 * scale}" y="${150 * scale}" width="${5 * scale}" height="${34 * scale}" rx="${2 * scale}" fill="${accent}"/><line x1="${132 * scale}" y1="${150 * scale}" x2="${132 * scale}" y2="${186 * scale}" stroke="#ffffff" stroke-width="${1.5 * scale}"/>`;
  }
  if (type === 'clipboard') {
    return `<rect x="${130 * scale}" y="${152 * scale}" width="${24 * scale}" height="${32 * scale}" rx="${4 * scale}" fill="#ffffff" stroke="${secondary}" stroke-width="${2 * scale}"/><rect x="${138 * scale}" y="${148 * scale}" width="${8 * scale}" height="${6 * scale}" rx="${2 * scale}" fill="${secondary}"/><line x1="${136 * scale}" y1="${164 * scale}" x2="${148 * scale}" y2="${164 * scale}" stroke="${secondary}" stroke-width="${2 * scale}"/><line x1="${136 * scale}" y1="${172 * scale}" x2="${150 * scale}" y2="${172 * scale}" stroke="${secondary}" stroke-width="${2 * scale}"/>`;
  }
  if (type === 'leaf_pillow') {
    return `<ellipse cx="${62 * scale}" cy="${178 * scale}" rx="${18 * scale}" ry="${10 * scale}" fill="${secondary}" opacity="0.72"/><path d="M ${54 * scale} ${176 * scale} Q ${62 * scale} ${160 * scale} ${72 * scale} ${176 * scale} Q ${64 * scale} ${190 * scale} ${54 * scale} ${176 * scale}" fill="${accent}" opacity="0.9"/>`;
  }
  if (type === 'badge') {
    return `<rect x="${86 * scale}" y="${152 * scale}" width="${28 * scale}" height="${18 * scale}" rx="${4 * scale}" fill="#ffffff" stroke="${secondary}" stroke-width="${2 * scale}"/><circle cx="${94 * scale}" cy="${161 * scale}" r="${4 * scale}" fill="${secondary}"/><path d="M ${104 * scale} ${157 * scale} L ${110 * scale} ${161 * scale} L ${118 * scale} ${153 * scale}" stroke="${secondary}" stroke-width="${2 * scale}" fill="none" stroke-linecap="round"/>`;
  }
  if (type === 'megaphone') {
    return `<path d="M ${132 * scale} ${150 * scale} L ${156 * scale} ${142 * scale} L ${156 * scale} ${166 * scale} Z" fill="${secondary}"/><rect x="${124 * scale}" y="${152 * scale}" width="${10 * scale}" height="${10 * scale}" rx="${3 * scale}" fill="${accent}"/><path d="M ${160 * scale} ${146 * scale} Q ${170 * scale} ${154 * scale} ${160 * scale} ${162 * scale}" stroke="${secondary}" stroke-width="${3 * scale}" fill="none"/>`;
  }
  if (type === 'mic') {
    return `<circle cx="${142 * scale}" cy="${148 * scale}" r="${8 * scale}" fill="${secondary}"/><rect x="${140 * scale}" y="${156 * scale}" width="${4 * scale}" height="${18 * scale}" rx="${2 * scale}" fill="${secondary}"/><path d="M ${132 * scale} ${176 * scale} Q ${142 * scale} ${184 * scale} ${152 * scale} ${176 * scale}" stroke="${accent}" stroke-width="${2 * scale}" fill="none"/>`;
  }
  if (type === 'bubble_tea') {
    return `<path d="M ${130 * scale} ${150 * scale} L ${154 * scale} ${150 * scale} L ${148 * scale} ${182 * scale} L ${136 * scale} ${182 * scale} Z" fill="${secondary}"/><line x1="${142 * scale}" y1="${136 * scale}" x2="${146 * scale}" y2="${150 * scale}" stroke="${accent}" stroke-width="${3 * scale}"/><circle cx="${139 * scale}" cy="${173 * scale}" r="${3 * scale}" fill="#2f2e41"/><circle cx="${145 * scale}" cy="${167 * scale}" r="${3 * scale}" fill="#2f2e41"/>`;
  }
  if (type === 'laptop') {
    return `<rect x="${74 * scale}" y="${154 * scale}" width="${42 * scale}" height="${24 * scale}" rx="${3 * scale}" fill="#334155"/><rect x="${78 * scale}" y="${158 * scale}" width="${34 * scale}" height="${16 * scale}" rx="${2 * scale}" fill="${secondary}"/><rect x="${70 * scale}" y="${178 * scale}" width="${50 * scale}" height="${6 * scale}" rx="${3 * scale}" fill="#475569"/>`;
  }
  if (type === 'chart') {
    return `<rect x="${128 * scale}" y="${148 * scale}" width="${28 * scale}" height="${36 * scale}" rx="${4 * scale}" fill="#ffffff" stroke="${secondary}" stroke-width="${2 * scale}"/><line x1="${136 * scale}" y1="${174 * scale}" x2="${136 * scale}" y2="${158 * scale}" stroke="${secondary}" stroke-width="${3 * scale}"/><line x1="${144 * scale}" y1="${174 * scale}" x2="${144 * scale}" y2="${164 * scale}" stroke="${secondary}" stroke-width="${3 * scale}"/><line x1="${152 * scale}" y1="${174 * scale}" x2="${152 * scale}" y2="${152 * scale}" stroke="${accent}" stroke-width="${3 * scale}"/>`;
  }
  if (type === 'gavel') {
    return `<rect x="${130 * scale}" y="${150 * scale}" width="${18 * scale}" height="${9 * scale}" rx="${2 * scale}" fill="${secondary}"/><rect x="${142 * scale}" y="${156 * scale}" width="${5 * scale}" height="${26 * scale}" rx="${2 * scale}" fill="${accent}"/><rect x="${124 * scale}" y="${178 * scale}" width="${24 * scale}" height="${5 * scale}" rx="${2 * scale}" fill="#7c5a3b"/>`;
  }
  if (type === 'crate') {
    return `<rect x="${128 * scale}" y="${154 * scale}" width="${28 * scale}" height="${24 * scale}" rx="${4 * scale}" fill="${secondary}"/><line x1="${134 * scale}" y1="${160 * scale}" x2="${150 * scale}" y2="${172 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/><line x1="${150 * scale}" y1="${160 * scale}" x2="${134 * scale}" y2="${172 * scale}" stroke="${accent}" stroke-width="${2 * scale}"/>`;
  }
  return '';
}

function renderMascot(def, mode, kind) {
  const large = mode === 'illustration';
  const width = large ? 400 : 200;
  const height = large ? 300 : 280;
  const scale = large ? 2 : 1;
  const bodyY = large ? 212 : 176;
  const label = !large
    ? `<rect x="${54 * scale}" y="${230}" width="${92 * scale}" height="${18}" rx="6" fill="#ffffff" opacity="0.92"/><text x="${100 * scale}" y="${242}" font-family="Arial" font-size="${9 * scale}" fill="#425466" text-anchor="middle" font-weight="bold">${def.name}</text>`
    : '';
  const bgDots = [
    `<circle cx="${40 * scale}" cy="${42 * scale}" r="${6 * scale}" fill="${def.accent}" opacity="0.45"/>`,
    `<circle cx="${160 * scale}" cy="${52 * scale}" r="${5 * scale}" fill="${def.secondary}" opacity="0.34"/>`,
    petals(large ? 322 : 164, large ? 78 : 64, large ? 16 : 8, def.secondary),
  ].join('');
  const neckProp = kind === 'worker'
    ? `<rect x="${90 * scale}" y="${150 * scale}" width="${20 * scale}" height="${14 * scale}" rx="${4 * scale}" fill="#ffffff" opacity="0.86"/><circle cx="${100 * scale}" cy="${157 * scale}" r="${3 * scale}" fill="${def.secondary}"/>`
    : '';
  const paws = kind === 'worker'
    ? `<rect x="${72 * scale}" y="${210 * scale}" width="${14 * scale}" height="${26 * scale}" rx="${7 * scale}" fill="${def.primary}"/><rect x="${114 * scale}" y="${210 * scale}" width="${14 * scale}" height="${26 * scale}" rx="${7 * scale}" fill="${def.primary}"/><ellipse cx="${79 * scale}" cy="${236 * scale}" rx="${8 * scale}" ry="${5 * scale}" fill="${def.accent}"/><ellipse cx="${121 * scale}" cy="${236 * scale}" rx="${8 * scale}" ry="${5 * scale}" fill="${def.accent}"/>`
    : `<rect x="${70 * scale}" y="${210 * scale}" width="${12 * scale}" height="${24 * scale}" rx="${6 * scale}" fill="${def.primary}"/><rect x="${118 * scale}" y="${210 * scale}" width="${12 * scale}" height="${24 * scale}" rx="${6 * scale}" fill="${def.primary}"/><ellipse cx="${76 * scale}" cy="${234 * scale}" rx="${8 * scale}" ry="${5 * scale}" fill="${def.accent}"/><ellipse cx="${124 * scale}" cy="${234 * scale}" rx="${8 * scale}" ry="${5 * scale}" fill="${def.accent}"/>`;
  return `<!-- ${def.name} - generated expansion asset -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" fill="${def.bg}" rx="${large ? 0 : 14}"/>
  ${bgDots}
  ${renderTail(def.tail, scale, def.primary, def.accent)}
  <ellipse cx="${100 * scale}" cy="${bodyY}" rx="${large ? 82 : 54}" ry="${large ? 72 : 48}" fill="${def.primary}"/>
  <ellipse cx="${100 * scale}" cy="${large ? 140 : 120}" rx="${large ? 64 : 42}" ry="${large ? 60 : 38}" fill="${def.primary}"/>
  ${renderEar(def.ear, 'left', scale, def.primary, def.accent)}
  ${renderEar(def.ear, 'right', scale, def.primary, def.accent)}
  <ellipse cx="${100 * scale}" cy="${large ? 195 : 168}" rx="${large ? 48 : 30}" ry="${large ? 42 : 28}" fill="${def.accent}" opacity="0.94"/>
  <ellipse cx="${84 * scale}" cy="${large ? 136 : 116}" rx="${large ? 13 : 8.5}" ry="${large ? 15 : 10}" fill="#2c1810"/>
  <ellipse cx="${116 * scale}" cy="${large ? 136 : 116}" rx="${large ? 13 : 8.5}" ry="${large ? 15 : 10}" fill="#2c1810"/>
  <circle cx="${87 * scale}" cy="${large ? 132 : 113}" r="${large ? 4.8 : 3}" fill="#ffffff"/>
  <circle cx="${119 * scale}" cy="${large ? 132 : 113}" r="${large ? 4.8 : 3}" fill="#ffffff"/>
  <ellipse cx="${100 * scale}" cy="${large ? 156 : 130}" rx="${large ? 8 : 5}" ry="${large ? 6 : 4}" fill="#3b2f2f"/>
  <path d="M ${88 * scale} ${large ? 166 : 138} Q ${100 * scale} ${large ? 176 : 144} ${112 * scale} ${large ? 166 : 138}" stroke="#3b2f2f" stroke-width="${large ? 3 : 2}" fill="none" stroke-linecap="round"/>
  <ellipse cx="${68 * scale}" cy="${large ? 150 : 126}" rx="${large ? 14 : 10}" ry="${large ? 8 : 6}" fill="#FFB3C7" opacity="0.48"/>
  <ellipse cx="${132 * scale}" cy="${large ? 150 : 126}" rx="${large ? 14 : 10}" ry="${large ? 8 : 6}" fill="#FFB3C7" opacity="0.48"/>
  ${neckProp}
  ${paws}
  ${renderAccessory(def.accessory, scale, def.secondary, def.accent)}
  ${label}
</svg>`;
}

function renderActionMotif(def, scale) {
  if (def.motif === 'hammock') {
    return `<path d="M ${58 * scale} ${172 * scale} Q ${100 * scale} ${210 * scale} ${142 * scale} ${172 * scale}" stroke="${def.primary}" stroke-width="${6 * scale}" fill="none"/><line x1="${58 * scale}" y1="${172 * scale}" x2="${58 * scale}" y2="${120 * scale}" stroke="${def.accent}" stroke-width="${4 * scale}"/><line x1="${142 * scale}" y1="${172 * scale}" x2="${142 * scale}" y2="${120 * scale}" stroke="${def.accent}" stroke-width="${4 * scale}"/><ellipse cx="${100 * scale}" cy="${160 * scale}" rx="${22 * scale}" ry="${12 * scale}" fill="${def.secondary}" opacity="0.9"/>`;
  }
  if (def.motif === 'megaphone') {
    return `<path d="M ${70 * scale} ${150 * scale} L ${126 * scale} ${130 * scale} L ${126 * scale} ${184 * scale} Z" fill="${def.primary}"/><rect x="${58 * scale}" y="${150 * scale}" width="${16 * scale}" height="${18 * scale}" rx="${4 * scale}" fill="${def.secondary}"/><path d="M ${136 * scale} ${136 * scale} Q ${160 * scale} ${156 * scale} ${136 * scale} ${176 * scale}" stroke="${def.accent}" stroke-width="${5 * scale}" fill="none"/><circle cx="${158 * scale}" cy="${132 * scale}" r="${7 * scale}" fill="${def.accent}" opacity="0.9"/><circle cx="${164 * scale}" cy="${180 * scale}" r="${5 * scale}" fill="${def.secondary}" opacity="0.9"/>`;
  }
  if (def.motif === 'resume_stack') {
    return `<rect x="${68 * scale}" y="${120 * scale}" width="${56 * scale}" height="${76 * scale}" rx="${6 * scale}" fill="#ffffff" stroke="${def.primary}" stroke-width="${3 * scale}"/><rect x="${86 * scale}" y="${108 * scale}" width="${56 * scale}" height="${76 * scale}" rx="${6 * scale}" fill="#ffffff" stroke="${def.accent}" stroke-width="${3 * scale}"/><line x1="${96 * scale}" y1="${132 * scale}" x2="${132 * scale}" y2="${132 * scale}" stroke="${def.primary}" stroke-width="${3 * scale}"/><line x1="${96 * scale}" y1="${146 * scale}" x2="${136 * scale}" y2="${146 * scale}" stroke="${def.accent}" stroke-width="${3 * scale}"/><circle cx="${112 * scale}" cy="${164 * scale}" r="${10 * scale}" fill="${def.secondary}" opacity="0.86"/>`;
  }
  return `<rect x="${70 * scale}" y="${132 * scale}" width="${72 * scale}" height="${52 * scale}" rx="${8 * scale}" fill="${def.primary}"/><path d="M ${106 * scale} ${108 * scale} L ${140 * scale} ${126 * scale} L ${126 * scale} ${188 * scale} L ${92 * scale} ${170 * scale} Z" fill="${def.secondary}" opacity="0.9"/><path d="M ${100 * scale} ${136 * scale} Q ${116 * scale} ${148 * scale} ${100 * scale} ${164} Q ${84 * scale} ${148 * scale} ${100 * scale} ${136 * scale}" fill="#ffffff"/><rect x="${82 * scale}" y="${142 * scale}" width="${36 * scale}" height="${6 * scale}" rx="${3 * scale}" fill="${def.accent}"/>`;
}

function renderAction(def, mode) {
  const large = mode === 'illustration';
  const width = large ? 400 : 200;
  const height = large ? 300 : 280;
  const scale = large ? 2 : 1;
  const label = !large
    ? `<rect x="${54 * scale}" y="228" width="${92 * scale}" height="18" rx="6" fill="#ffffff" opacity="0.92"/><text x="${100 * scale}" y="240" font-family="Arial" font-size="${9 * scale}" fill="#425466" text-anchor="middle" font-weight="bold">${def.name}</text>`
    : '';
  return `<!-- ${def.name} - generated expansion asset -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" fill="${def.bg}" rx="${large ? 0 : 14}"/>
  <circle cx="${42 * scale}" cy="${42 * scale}" r="${8 * scale}" fill="${def.accent}" opacity="0.38"/>
  <circle cx="${160 * scale}" cy="${54 * scale}" r="${6 * scale}" fill="${def.secondary}" opacity="0.34"/>
  ${petals(large ? 320 : 162, large ? 84 : 68, large ? 18 : 9, def.primary)}
  <ellipse cx="${100 * scale}" cy="${large ? 176 : 168}" rx="${large ? 70 : 44}" ry="${large ? 62 : 42}" fill="#ffffff" opacity="0.82"/>
  ${renderActionMotif(def, scale)}
  ${label}
</svg>`;
}

function main() {
  for (const def of petDefs) {
    writeAsset(`cards/pets/${def.id}.svg`, renderMascot(def, 'card', 'pet'));
    writeAsset(`illustrations/pets/${def.id}.svg`, renderMascot(def, 'illustration', 'pet'));
  }

  for (const def of workerDefs) {
    writeAsset(`cards/workers/${def.id}.svg`, renderMascot(def, 'card', 'worker'));
    writeAsset(`illustrations/workers/${def.id}.svg`, renderMascot(def, 'illustration', 'worker'));
  }

  for (const def of actionDefs) {
    writeAsset(`cards/actions/${def.id}.svg`, renderAction(def, 'card'));
    writeAsset(`illustrations/actions/${def.id}.svg`, renderAction(def, 'illustration'));
  }

  console.log(`Generated ${petDefs.length * 2 + workerDefs.length * 2 + actionDefs.length * 2} SVG assets.`);
}

main();
