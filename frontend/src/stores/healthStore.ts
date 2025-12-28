import { create } from 'zustand';
import { healthApi, type SystemHealth } from '../api/client';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'loading' | 'error';

interface HealthState {
  status: HealthStatus;
  warnings: string[];
  lastChecked: Date | null;
  isPolling: boolean;

  // Actions
  checkHealth: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useHealthStore = create<HealthState>((set, get) => ({
  status: 'loading',
  warnings: [],
  lastChecked: null,
  isPolling: false,

  checkHealth: async () => {
    try {
      const health: SystemHealth = await healthApi.getSystemHealth();
      set({
        status: health.status as HealthStatus,
        warnings: health.warnings,
        lastChecked: new Date(),
      });
    } catch (error) {
      console.error('Failed to check health:', error);
      set({
        status: 'error',
        warnings: ['Unable to check system status'],
        lastChecked: new Date(),
      });
    }
  },

  startPolling: () => {
    const { isPolling, checkHealth } = get();
    if (isPolling) return;

    // Initial check
    checkHealth();

    // Poll every 30 seconds
    pollingInterval = setInterval(checkHealth, 30000);
    set({ isPolling: true });
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    set({ isPolling: false });
  },
}));
