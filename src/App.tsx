import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { PermissionGuard } from '@/components/PermissionGuard';
import { ThemeProvider } from '@/hooks/useTheme';
import { ProjectProvider } from '@/contexts/ProjectContext';

// Paginas criticas (bundle inicial)
import Index from '@/pages/Index';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ResetPassword from '@/pages/ResetPassword';
import NotFound from '@/pages/NotFound';

// Paginas fluxo principal (carregadas sob demanda)
const TestPlans = lazy(() => import('@/pages/TestPlans').then(m => ({ default: m.TestPlans })));
const TestCases = lazy(() => import('@/pages/TestCases').then(m => ({ default: m.TestCases })));
const TestExecutions = lazy(() => import('@/pages/TestExecutions').then(m => ({ default: m.TestExecutions })));
const Gestao = lazy(() => import('@/pages/Gestao').then(m => ({ default: m.Gestao })));

// Paginas pesadas/pouco frequentes (totalmente lazy)
const AIGenerator = lazy(() => import('@/pages/AIGenerator').then(m => ({ default: m.AIGenerator })));
const History = lazy(() => import('@/pages/History').then(m => ({ default: m.History })));
const Reports = lazy(() => import('@/pages/Reports').then(m => ({ default: m.Reports })));
const ModelControlPanel = lazy(() => import('@/pages/ModelControlPanel').then(m => ({ default: m.ModelControlPanel })));
const ProjectAdmin = lazy(() => import('@/pages/ProjectAdmin'));
const UserManagement = lazy(() => import('@/pages/UserManagement').then(m => ({ default: m.UserManagement })));
const About = lazy(() => import('@/pages/About').then(m => ({ default: m.About })));

import './App.css';

const queryClient = new QueryClient();

// Componente para gerenciar redirecionamentos
function AppRouter() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  const suspenseFallback = (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-muted-foreground">Carregando página...</div>
    </div>
  );

  return (
    <Suspense fallback={suspenseFallback}>
    <Routes>
      {/* Rotas públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* Rotas protegidas */}
      <Route element={<AuthGuard><Layout /></AuthGuard>}>
        <Route path="/" element={<Index />} />
        <Route path="/plans" element={<PermissionGuard requiredPermission="can_manage_plans"><TestPlans /></PermissionGuard>} />
        <Route path="/cases" element={<PermissionGuard requiredPermission="can_manage_cases"><TestCases /></PermissionGuard>} />
        <Route path="/executions" element={<PermissionGuard requiredPermission="can_manage_executions"><TestExecutions /></PermissionGuard>} />
        {/* Nova página Gestão com abas */}
        <Route 
          path="/management" 
          element={
            <PermissionGuard anyOfPermissions={["can_manage_cases", "can_manage_executions"]} redirect="/">
              <Gestao />
            </PermissionGuard>
          } 
        />

        {/* Rotas antigas redirecionam para Gestão com a aba correspondente */}
        <Route path="/requirements" element={<PermissionGuard requiredPermission="can_manage_cases"><Navigate to="/management?tab=requirements" replace /></PermissionGuard>} />
        <Route path="/traceability" element={<PermissionGuard requiredPermission="can_manage_cases"><Navigate to="/management?tab=traceability" replace /></PermissionGuard>} />
        <Route path="/defects" element={<PermissionGuard requiredPermission="can_manage_executions"><Navigate to="/management?tab=defects" replace /></PermissionGuard>} />
        <Route path="/ai-generator" element={<PermissionGuard requiredPermission="can_use_ai"><AIGenerator /></PermissionGuard>} />
        <Route path="/history" element={<PermissionGuard><History /></PermissionGuard>} />
        <Route path="/reports" element={<PermissionGuard requiredPermission="can_view_reports"><Reports /></PermissionGuard>} />
        <Route path="/model-control" element={<PermissionGuard requiredRole="admin" redirect="/"><ModelControlPanel /></PermissionGuard>} />
        <Route path="/project-admin" element={<PermissionGuard requiredPermission="can_manage_projects" redirect="/"><ProjectAdmin /></PermissionGuard>} />
        <Route path="/user-management" element={<PermissionGuard requiredPermission="can_manage_users" redirect="/"><UserManagement /></PermissionGuard>} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ProjectProvider>
            <Router>
              <AppRouter />
              <Toaster />
            </Router>
          </ProjectProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
