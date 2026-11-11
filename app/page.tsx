'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatInterface } from '@/components/ChatInterface';
import { ProductTable } from '@/components/ProductTable';
import { useState } from 'react';

export default function Home() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen bg-background">
        <div className="container mx-auto p-4">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Warung Copilot</h1>
            <p className="text-muted-foreground mt-1">
              Kelola toko online Anda dengan AI Assistant
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-[calc(100vh-12rem)]">
            <ChatInterface />
            <ProductTable />
          </div>
        </div>
      </main>
    </QueryClientProvider>
  );
}
