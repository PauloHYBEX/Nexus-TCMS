import { LayoutGrid, LayoutList } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ViewModeToggleProps {
  viewMode: 'cards' | 'list';
  onViewModeChange: (mode: 'cards' | 'list') => void;
}

export const ViewModeToggle = ({ viewMode, onViewModeChange }: ViewModeToggleProps) => {
  return (
    <TooltipProvider>
      <div className="flex rounded-md border border-border/60 overflow-hidden">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onViewModeChange('cards')}
              className={cn(
                'h-9 w-9 flex items-center justify-center transition-colors',
                viewMode === 'cards'
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Cards</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => onViewModeChange('list')}
              className={cn(
                'h-9 w-9 flex items-center justify-center border-l border-border/60 transition-colors',
                viewMode === 'list'
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent><p>Lista</p></TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
