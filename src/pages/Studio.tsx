import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, History as HistoryIcon, SlidersHorizontal, Rocket, FileText, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';

export default function Studio() {
  const navigate = useNavigate();
  const { currentProject } = useProject();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Studio</h2>
          <p className="text-sm text-muted-foreground mt-1">Ferramentas de produtividade e IA para acelerar seus testes</p>
        </div>
        {currentProject?.name && (
          <Badge variant="secondary">Projeto: {currentProject.name}</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/ai-generator')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Gerador IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Gere planos, casos e execuções a partir de descrições ou documentos.</p>
            <Button className="mt-4" size="sm">Abrir</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/history')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HistoryIcon className="h-5 w-5" /> Histórico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Consulte ações recentes e resultados gerados.</p>
            <Button className="mt-4" size="sm" variant="outline">Abrir</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/model-control')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5" /> Painel de Modelos (MCP)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Gerencie provedores, modelos e mapeamentos por tarefa.</p>
            <Button className="mt-4" size="sm" variant="outline">Abrir</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/plans')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Planos de Teste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Visualize e gerencie planos gerados e editados.</p>
            <Button className="mt-4" size="sm" variant="outline">Abrir</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/reports')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> Relatórios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">KPIs e relatórios operacionais do projeto atual.</p>
            <Button className="mt-4" size="sm" variant="outline">Abrir</Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => navigate('/modules')}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" /> Módulos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">Atalhos para módulos e integrações.</p>
            <Button className="mt-4" size="sm" variant="outline">Abrir</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
