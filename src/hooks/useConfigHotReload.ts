import { useEffect } from 'react';
import { subscribeToAdminEvents } from '../admin/api';

export function useConfigHotReload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    return subscribeToAdminEvents(() => {
      window.location.reload();
    });
  }, [enabled]);
}
