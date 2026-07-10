/**
 * main.jsx — Điểm khởi động SPA: mount cây React vào #root với các provider
 * bọc ngoài (thứ tự từ ngoài vào trong):
 *   BrowserRouter — routing phía client (URL sạch, không dùng hash).
 *   QueryClientProvider — TanStack Query: cache server state, retry 1 lần,
 *     dữ liệu được coi là "tươi" 30s (khỏi refetch khi chuyển trang qua lại).
 *   AuthProvider — trạng thái đăng nhập toàn cục.
 *   AlertProvider — toast + modal alert/confirm toàn cục.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { AlertProvider } from './context/AlertContext';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30 giây
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AlertProvider>
            <App />
          </AlertProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>
);
