import { getActionTargetModeFromConfig } from '../utils/runtimeConfig';

export type ActionTargetMode = 'none' | 'pet' | 'worker' | 'swap';

export function getActionTargetMode(cardId: string): ActionTargetMode {
  const configuredMode = getActionTargetModeFromConfig(cardId);
  if (configuredMode !== 'none') {
    return configuredMode;
  }
  switch (cardId) {
    case 'action_001':
    case 'action_008':
      return 'pet';
    case 'action_006':
      return 'worker';
    case 'action_003':
      return 'swap';
    default:
      return 'none';
  }
}
