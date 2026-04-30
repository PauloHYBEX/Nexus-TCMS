import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ComboboxItem = {
  value: string;
  label: string;
  hint?: string;
};

interface SearchableComboboxProps {
  items: ComboboxItem[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

export const SearchableCombobox: React.FC<SearchableComboboxProps> = ({
  items,
  value,
  onChange,
  placeholder = 'Selecione...',
  emptyText = 'Nenhum item encontrado',
  disabled,
  triggerClassName,
}) => {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => items.find(i => i.value === value) || null, [items, value]);

  const handleSelect = (val: string) => {
    const next = val === value ? '' : val;
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between', triggerClassName)}
        >
          <span className="truncate text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Pesquisar..." />
          <CommandList className="max-h-60 overflow-auto">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem key={item.value} value={item.label} onSelect={() => handleSelect(item.value)} className="min-w-max whitespace-nowrap">
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', item.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="ml-2 text-xs text-muted-foreground truncate">{item.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default SearchableCombobox;
