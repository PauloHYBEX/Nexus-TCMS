import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Info, Zap, CheckCircle, Sparkles } from 'lucide-react';

export const About = () => {
  const version = '1.0.0';
  const buildDate = new Date().toLocaleDateString('pt-BR');

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Info className="h-8 w-8 text-blue-600" />
        <h1 className="text-3xl font-bold tracking-tight">Sobre o Sistema</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-600" />
              Informações do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm text-muted-foreground">Nome do Sistema</Label>
              <p className="font-medium">TestPilot AI</p>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Versão</Label>
              <div className="flex items-center gap-2">
                <p className="font-medium">{version}</p>
                <Badge variant="secondary">Stable</Badge>
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Data de Build</Label>
              <p className="font-medium">{buildDate}</p>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Modo de Operação</Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-blue-100 text-blue-800">Single-tenant</Badge>
              </div>
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">Tecnologias</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                <Badge>React 18</Badge>
                <Badge>TypeScript</Badge>
                <Badge>Tailwind CSS</Badge>
                <Badge>Vite</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              Recursos Principais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Gestão de Testes Automatizada</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Integração com IA (Gemini)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Relatórios e Métricas</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Permissões locais (modo master)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm">Uso Particular/Privado</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            IA e Modelos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Configure modelos e templates de IA no Model Control Panel. O sistema utiliza Google Gemini.
          </p>
          <div className="text-sm">
            Caminho: <code className="font-mono">Model Control Panel</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};