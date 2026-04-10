'use client';

import Sidebar from '@/components/layout/Sidebar';
import { ToastProvider } from '@/components/ui/ToastProvider';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main
          className="flex-1 lg:ml-[260px] p-4 sm:p-6 lg:p-8"
          style={{ paddingTop: '24px' }}
        >
          <div className="max-w-7xl mx-auto pt-10 lg:pt-0">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
