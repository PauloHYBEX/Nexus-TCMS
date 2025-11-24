
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, RefreshCw, Eye, Sparkles } from 'lucide-react';
import { TestPlan } from '@/types';
import { StandardButton } from '@/components/StandardButton';

interface GeneratedItem {
  id: string;
  title: string;
  description: string;
  objective?: string;
  scope?: string;
  approach?: string;
  criteria?: string;
  resources?: string;
  schedule?: string;
  risks?: string;
  preconditions?: string;
  expected_result?: string;
  priority?: string;
  type?: string;
  steps?: Array<{
    action: string;
    expected_result: string;
  }>;
  status: 'pending' | 'approved' | 'rejected' | 'regenerating';
}

interface AIBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: GeneratedItem[];
  onApprove: (planId: string) => void;
  onReject: (planId: string) => void;
  onRegenerate: (planId: string, feedback: string) => void;
  onViewDetails: (plan: GeneratedItem) => void;
}

export const AIBatchModal = ({ 
  isOpen, 
  onClose, 
  plans, 
  onApprove, 
  onReject, 
  onRegenerate,
  onViewDetails 
}: AIBatchModalProps) => {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const handleRegenerate = (planId: string) => {
    setSelectedPlan(planId);
    setShowFeedback(true);
  };

  const submitRegenerate = () => {
    if (selectedPlan) {
      onRegenerate(selectedPlan, feedback);
      setShowFeedback(false);
      setFeedback('');
      setSelectedPlan(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'regenerating': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Aprovado';
      case 'rejected': return 'Rejeitado';
      case 'regenerating': return 'Regenerando';
      default: return 'Pendente';
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] text-center overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Planos Gerados pela IA
            </DialogTitle>
            <DialogDescription>
              Revise e aprove os planos de teste gerados automaticamente pela IA
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[70vh] overflow-x-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
              {plans.map((plan) => (
                <Card key={plan.id} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm line-clamp-2">{plan.title}</CardTitle>
                      <Badge className={getStatusColor(plan.status)}>
                        {getStatusText(plan.status)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-xs text-gray-600 line-clamp-3 mb-4">
                      {plan.description}
                    </p>
                    
                    <div className="flex flex-col gap-2">
                      <StandardButton
                        size="sm"
                        variant="outline"
                        icon={Eye}
                        onClick={() => onViewDetails(plan)}
                        className="w-full"
                      >
                        Ver Detalhes
                      </StandardButton>
                      
                      {plan.status === 'pending' && (
                        <div className="flex gap-2">
                          <StandardButton
                            size="sm"
                            icon={CheckCircle}
                            onClick={() => onApprove(plan.id)}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            Aprovar
                          </StandardButton>
                          <StandardButton
                            size="sm"
                            variant="outline"
                            icon={XCircle}
                            onClick={() => onReject(plan.id)}
                            className="flex-1"
                          >
                            Rejeitar
                          </StandardButton>
                        </div>
                      )}
                      
                      {(plan.status === 'pending' || plan.status === 'rejected') && (
                        <StandardButton
                          size="sm"
                          variant="outline"
                          icon={RefreshCw}
                          onClick={() => handleRegenerate(plan.id)}
                          className="w-full"
                        >
                          Refazer
                        </StandardButton>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-4 border-t">
            <div className="text-sm text-gray-600">
              {plans.filter(p => p.status === 'approved').length} aprovados, {' '}
              {plans.filter(p => p.status === 'rejected').length} rejeitados, {' '}
              {plans.filter(p => p.status === 'pending').length} pendentes
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFeedback} onOpenChange={setShowFeedback}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle>Feedback para Regeneração</DialogTitle>
            <DialogDescription>
              Forneça detalhes específicos para que a IA possa melhorar o plano
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="feedback">
                Forneça detalhes específicos para melhorar este plano:
              </Label>
              <Textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                placeholder="Descreva o que deve ser alterado ou melhorado..."
              />
            </div>
            
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setShowFeedback(false)}>
                Cancelar
              </Button>
              <Button onClick={submitRegenerate} disabled={!feedback.trim()}>
                Regenerar Plano
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
