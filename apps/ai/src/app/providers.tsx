"use client";
import { AuthProvider } from "@/hooks/useAuth";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ProjectProvider>
          {children}
        </ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
