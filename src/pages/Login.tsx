import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import KrigzisLogo from '@/components/branding/KrigzisLogo';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error } = await signIn(email, password);
      if (error) {
        setError('E-mail ou senha inválidos.');
      } else {
        navigate('/');
      }
    } catch {
      setError('Erro ao tentar entrar.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setResetMessage('');
    setError('');
    if (!email) {
      setError('Informe seu e-mail para enviar o link de recuperação.');
      return;
    }
    try {
      setResetLoading(true);
      const { error } = await resetPassword(email);
      if (error) {
        setError('Não foi possível enviar o e-mail de recuperação. Tente novamente.');
      } else {
        setResetMessage('Enviamos um link de recuperação para o seu e-mail. Verifique sua caixa de entrada.');
      }
    } catch {
      setError('Ocorreu um erro ao solicitar a recuperação de senha.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="bg-card/80 backdrop-blur-sm border border-border/50 shadow-2xl">
          <CardHeader className="flex flex-col items-center space-y-4 pb-6">
            <div className="flex items-center gap-3">
              <KrigzisLogo size={32} className="h-8 w-8" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-brand to-brand/80 bg-clip-text text-transparent">
                TestPilot AI
              </h1>
            </div>
            <div className="text-center space-y-2">
              <CardTitle className="text-xl font-semibold text-foreground">Entrar na conta</CardTitle>
              <p className="text-sm text-muted-foreground">Bem-vindo de volta!</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="Seu e-mail"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="h-12 px-4 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
                  />
                </div>
                <div className="space-y-2 relative">
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Senha"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="h-12 px-4 pr-12 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              {error && <div className="text-destructive text-sm text-center bg-destructive/10 p-3 rounded-lg border border-destructive/20">{error}</div>}
              {resetMessage && <div className="text-success text-sm text-center bg-success/10 p-3 rounded-lg border border-success/20">{resetMessage}</div>}
              <Button 
                className="w-full h-12 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0 font-semibold transition-all duration-200 shadow-lg hover:shadow-xl" 
                type="submit" 
                disabled={loading}
              >
                {loading ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
            <div className="flex flex-col space-y-4">
              <div className="text-right">
                <button
                  type="button"
                  className="text-sm text-brand hover:text-brand/80 underline disabled:opacity-50 transition-colors"
                  onClick={handleResetPassword}
                  disabled={resetLoading}
                >
                  {resetLoading ? 'Enviando...' : 'Esqueci minha senha'}
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>
              <div className="text-center">
                <span className="text-sm text-muted-foreground">Não tem uma conta? </span>
                <a href="/register" className="text-brand hover:text-brand/80 underline font-medium transition-colors">
                  Cadastre-se aqui
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}