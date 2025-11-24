-- RLS: permitir leitura de todos os logs por qualquer usuário autenticado
-- (mantém as regras atuais de INSERT/UPDATE/DELETE)

-- Garante que a extensão de autenticação do Supabase esteja ativa (normalmente já está)
create extension if not exists "pgjwt" with schema public;

-- Política ampla de SELECT
create policy if not exists "activity_logs_read_all_auth"
  on public.activity_logs
  for select
  to authenticated
  using (true);
