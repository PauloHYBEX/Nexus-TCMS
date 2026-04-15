import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import KrigzisLogo from '@/components/branding/KrigzisLogo';
import { Eye, EyeOff, User, Mail, Lock, Key } from 'lucide-react';

export default function Register() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [databaseCode, setDatabaseCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signUp } = useAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      const { error } = await signUp(email, password, name);
      
      if (error) {
        setError(error.message || 'Erro ao criar conta');
      } else {
        setSuccess(true);
        setTimeout(() => navigate('/'), 1500);
      }
    } catch {
      setError('Erro inesperado ao criar conta');
    } finally {
      setLoading(false);
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
                Nexus Testing
              </h1>
            </div>
            <div className="text-center space-y-2">
              <CardTitle className="text-xl font-semibold text-foreground">Criar nova conta</CardTitle>
              <p className="text-sm text-muted-foreground">Junte-se à nossa plataforma</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2 relative">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Seu nome completo"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      autoFocus
                      className="h-12 pl-10 pr-4 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
                    />
                  </div>
                </div>
                
                <div className="space-y-2 relative">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="Seu e-mail"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="h-12 pl-10 pr-4 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
                    />
                  </div>
                </div>
                
                <div className="space-y-2 relative">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Sua senha"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="h-12 pl-10 pr-12 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
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
                
                <div className="space-y-2 relative">
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Código de acesso (opcional)"
                      value={databaseCode}
                      onChange={e => setDatabaseCode(e.target.value)}
                      className="h-12 pl-10 pr-4 bg-background/50 border-border/50 focus:border-brand/50 focus:ring-brand/20"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground px-1">
                    Se você tem um código de acesso de uma organização, cole-o acima
                  </p>
                </div>
              </div>
              
              {error && <div className="text-destructive text-sm text-center bg-destructive/10 p-3 rounded-lg border border-destructive/20">{error}</div>}
              {success && <div className="text-success text-sm text-center bg-success/10 p-3 rounded-lg border border-success/20">Conta criada! Redirecionando...</div>}
              
              <Button 
                className="w-full h-12 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0 font-semibold transition-all duration-200 shadow-lg hover:shadow-xl" 
                type="submit" 
                disabled={loading}
              >
                {loading ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>
            
            <div className="flex flex-col space-y-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>
              
              <div className="text-center">
                <span className="text-sm text-muted-foreground">Já tem uma conta? </span>
                <a href="/login" className="text-brand hover:text-brand/80 underline font-medium transition-colors">
                  Entre aqui
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}