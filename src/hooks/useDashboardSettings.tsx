
import { useState, useEffect } from 'react';

interface DashboardSettings {
  quickActionType: 'plan' | 'case' | 'execution';
  applyProjectThemeEnabled: boolean;
}

const DEFAULT_SETTINGS: DashboardSettings = {
  quickActionType: 'plan',
  applyProjectThemeEnabled: false,
};

export const useDashboardSettings = () => {
  const [settings, setSettings] = useState<DashboardSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedSettings = localStorage.getItem('dashboard-settings');
    if (savedSettings) {
      try {
        setSettings(JSON.parse(savedSettings));
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
    }
  }, []);

  const updateSettings = (newSettings: Partial<DashboardSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    localStorage.setItem('dashboard-settings', JSON.stringify(updated));
  };

  return {
    settings,
    updateSettings
  };
};
