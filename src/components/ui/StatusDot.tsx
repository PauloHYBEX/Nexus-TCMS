import { cn } from '@/lib/utils';

const DOT_CLASS: Record<string, string> = {
  // TestPlan status (standard + dynamic fallbacks)
  draft:        'bg-slate-400',
  active:       'bg-emerald-500',
  review:       'bg-amber-500',
  approved:     'bg-blue-500',
  archived:     'bg-red-400',
  completed:    'bg-teal-500',
  canceled:     'bg-red-500',
  paused:       'bg-orange-400',
  // TestExecution status
  passed:       'bg-emerald-500',
  failed:       'bg-red-500',
  blocked:      'bg-amber-500',
  not_tested:   'bg-slate-400',
  // Requirement status
  open:         'bg-slate-400',
  in_progress:  'bg-blue-500',
  deprecated:   'bg-slate-500',
  // Defect status
  in_analysis:  'bg-amber-500',
  fixed:        'bg-blue-500',
  validated:    'bg-emerald-500',
  closed:       'bg-slate-500',
};

interface StatusDotProps {
  status: string;
  label: string;
  className?: string;
}

export const StatusDot = ({ status, label, className }: StatusDotProps) => {
  const dotCls = DOT_CLASS[status] ?? 'bg-brand';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-foreground/80 whitespace-nowrap', className)}>
      <span className={cn('h-2 w-2 rounded-full flex-shrink-0', dotCls)} />
      {label}
    </span>
  );
};
