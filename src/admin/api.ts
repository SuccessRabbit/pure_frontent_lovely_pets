import { getRuntimeConfig } from '../utils/runtimeConfig';
import type { AdminDatasetResponse, RawAdminDatasets } from './types';

const ADMIN_API_BASE = 'http://127.0.0.1:3001';

function isLocalAdminHost() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function toRawReadonlyDatasets(): RawAdminDatasets {
  const runtime = getRuntimeConfig();
  return {
    cards: runtime.cards.map(card => ({
      id: card.id,
      name: card.name,
      type: card.type,
      cost: String(card.cost),
      rarity: card.rarity,
      description: card.description,
      tags: card.tags.join('|'),
      income: card.income == null ? '' : String(card.income),
      stress: card.stress == null ? '' : String(card.stress),
      stressLimit: card.stressLimit == null ? '' : String(card.stressLimit),
      canDiscard: card.canDiscard === false ? 'false' : 'true',
      cardImagePath: card.image ?? '',
      illustrationPath: card.illustrationPath ?? '',
      imageFitMode: card.imageFitMode ?? 'contain',
      imageAnchorPreset: card.imageAnchorPreset ?? 'center',
      modelProfileId: card.modelProfileId ?? '',
    })),
    skillTemplates: runtime.skillTemplates.map(template => ({
      id: String(template.id ?? ''),
      name: String(template.name ?? ''),
      description: String(template.description ?? ''),
      scope: Array.isArray(template.scope) ? template.scope.join('|') : String(template.scope ?? ''),
      trigger: String(template.trigger ?? ''),
      targetMode: String(template.targetMode ?? ''),
      effectKind: String(template.effectKind ?? ''),
      paramSchemaJson: JSON.stringify(template.paramSchema ?? []),
      operationsJson: JSON.stringify(template.operations ?? []),
      summaryTemplate: String(template.summaryTemplate ?? ''),
      descriptionTemplate: String(template.descriptionTemplate ?? ''),
      supportsSecondTarget: String(Boolean(template.supportsSecondTarget)),
    })),
    cardSkills: runtime.cardSkills.map(binding => ({
      id: String(binding.id ?? ''),
      cardId: String(binding.cardId ?? ''),
      templateId: String(binding.templateId ?? ''),
      enabled: String(Boolean(binding.enabled)),
      sortOrder: String(binding.sortOrder ?? 0),
      paramsJson: JSON.stringify(binding.params ?? {}),
    })),
    modelProfiles: runtime.modelProfiles.map(profile => ({
      id: profile.id,
      name: profile.name,
      rendererType: profile.rendererType,
      source: profile.source,
      scale: String(profile.scale),
      rotationY: String(profile.rotationY),
      offsetX: String(profile.offsetX),
      offsetY: String(profile.offsetY),
      offsetZ: String(profile.offsetZ),
      shadowSize: String(profile.shadowSize),
      thumbnailPath: profile.thumbnailPath ?? '',
      notes: profile.notes ?? '',
    })),
    globalConfig: Object.entries(runtime.globalConfigMap).map(([key, value]) => ({
      module: 'runtime',
      key,
      value: String(value),
      valueType: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      description: '只读运行时配置',
    })),
  };
}

export async function loadAdminDatasets(): Promise<AdminDatasetResponse> {
  if (isLocalAdminHost()) {
    try {
      const response = await fetch(`${ADMIN_API_BASE}/datasets`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // fall through to readonly mode
    }
  }

  return {
    canEdit: false,
    headers: {},
    raw: toRawReadonlyDatasets(),
    compiled: getRuntimeConfig() as unknown as Record<string, unknown>,
  };
}

export async function saveAdminDatasets(raw: RawAdminDatasets): Promise<AdminDatasetResponse> {
  const response = await fetch(`${ADMIN_API_BASE}/datasets/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: '保存失败' }));
    throw new Error(payload.error ?? '保存失败');
  }

  return response.json();
}

export function subscribeToAdminEvents(onUpdate: (payload: { version: number }) => void) {
  if (!isLocalAdminHost()) return () => {};

  const source = new EventSource(`${ADMIN_API_BASE}/events`);
  source.addEventListener('config-update', event => {
    const payload = JSON.parse((event as MessageEvent).data);
    onUpdate(payload);
  });

  return () => {
    source.close();
  };
}
