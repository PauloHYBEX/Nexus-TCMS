import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setError('No modo local, faça login primeiro para alterar a senha.');
      } else {
        setReady(true);
      }
    }).catch(() => setError('Não foi possível validar a sessão local.'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError('Não foi possível atualizar a senha. Tente novamente.');
      } else {
        setMessage('Senha alterada com sucesso! Você já pode entrar com a nova senha.');
      }
    } catch {
      setError('Ocorreu um erro ao atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md p-8 bg-card shadow-lg">
        <CardHeader className="flex flex-col items-center">
          <h1 className="text-2xl font-bold text-primary mb-2">Nexus Testing</h1>
          <CardTitle className="text-lg font-semibold mb-1">Redefinir senha</CardTitle>
          <span className="text-sm text-muted-foreground">Defina sua nova senha abaixo</span>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="text-sm text-muted-foreground text-center">
              Validando link de recuperação...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="password"
                placeholder="Nova senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Confirmar senha"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
              {error && <div className="text-destructive text-sm text-center">{error}</div>}
              {message && <div className="text-green-600 text-sm text-center">{message}</div>}
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
