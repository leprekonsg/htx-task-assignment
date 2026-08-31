// Entry point: the one file that actually mounts React into the page. It wraps the whole app in
// two providers that everything else relies on: QueryClientProvider (TanStack Query's cache of
// server data — see src/api/hooks.ts) and BrowserRouter (react-router's URL-driven navigation —
// see App.tsx for the routes). Nothing product-specific belongs in this file; start reading at
// App.tsx instead.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
