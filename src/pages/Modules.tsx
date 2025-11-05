import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, Sparkles } from 'lucide-react';
import { useProject } from '@/contexts/ProjectContext';

export default function Modules() {
  const { currentProject } = useProject();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Módulos</h2>
        {currentProject?.name && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <Package className="h-3.5 w-3.5" /> {currentProject.name}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Gerador IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Acesse o Gerador IA para criar planos, casos e execuções com suporte de modelos configuráveis.
            </p>
            <a href="/ai-generator" className="inline-flex mt-3 text-primary hover:underline">Abrir Gerador IA →</a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
