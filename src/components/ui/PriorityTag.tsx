import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

const CONFIG: Record<PriorityLevel, {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  cls: string;
}> = {
  low:      { Icon: ArrowDown,     label: 'Baixa',   cls: 'text-emerald-500 dark:text-emerald-400' },
  medium:   { Icon: ArrowRight,    label: 'Média',   cls: 'text-amber-500 dark:text-amber-400' },
  high:     { Icon: ArrowUp,       label: 'Alta',    cls: 'text-orange-500 dark:text-orange-400' },
  critical: { Icon: AlertTriangle, label: 'Crítica', cls: 'text-red-500 dark:text-red-400' },
};

interface PriorityTagProps {
  priority: string;
  className?: string;
  hideLabel?: boolean;
}

export const PriorityTag = ({ priority, className, hideLabel }: PriorityTagProps) => {
  const cfg = CONFIG[priority as PriorityLevel] ?? CONFIG.medium;
  const { Icon, label, cls } = cfg;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', cls, className)}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {!hideLabel && label}
    </span>
  );
};
