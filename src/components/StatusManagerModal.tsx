import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Trash2, Edit2, Plus } from 'lucide-react';
import { useStatusOptions, slugify } from '@/hooks/useStatusOptions';
import { StandardButton } from '@/components/StandardButton';

interface StatusManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  onAdded?: (value: string) => void; // opcional: definir status recém criado
}

export function StatusManagerModal({ open, onOpenChange, projectId, onAdded }: StatusManagerModalProps) {
  const { options, addStatus, removeStatus, renameStatus } = useStatusOptions(projectId);
  const [newLabel, setNewLabel] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = slugify(label);
    if (!value) return;
    addStatus({ value, label });
    setNewLabel('');
    if (onAdded) onAdded(value);
  };

  const startEdit = (value: string, label: string) => {
    setEditing(value);
    setEditLabel(label);
  };

  const saveEdit = () => {
    if (!editing) return;
    const label = editLabel.trim();
    if (!label) return;
    const nextValue = slugify(label);
    renameStatus(editing, label, nextValue);
    setEditing(null);
    setEditLabel('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar Status</DialogTitle>
          <DialogDescription>
            Adicione, renomeie ou remova status disponíveis para este projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newStatus">Novo status</Label>
            <div className="flex gap-2">
              <Input
                id="newStatus"
                placeholder="Ex.: Em Homologação"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }}}
              />
              <StandardButton onClick={handleAdd} variant="brand">
                <Plus className="h-4 w-4 mr-1" />
                Adicionar
              </StandardButton>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Opções atuais</Label>
            <div className="border rounded-md divide-y">
              {options.map((opt) => (
                <div key={opt.value} className="flex items-center justify-between gap-2 p-2">
                  {editing === opt.value ? (
                    <div className="flex-1 flex items-center gap-2">
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
                      <Button variant="default" size="sm" onClick={saveEdit}>Salvar</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setEditLabel(''); }}>Cancelar</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.value}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(opt.value, opt.label)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => removeStatus(opt.value)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
