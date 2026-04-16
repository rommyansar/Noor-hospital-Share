'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Users,
  Settings2,
  CalendarPlus,
  CalendarOff,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Activity,
  Stethoscope,
} from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard }, 
  { href: '/departments', label: 'Departments', icon: Building2 },
  { href: '/staff', label: 'Staff', icon: Users },
  { href: '/attendance', label: 'Attendance', icon: CalendarOff },
  { href: '/rules', label: 'Rules', icon: Settings2 },
  { href: '/monthly-entry', label: 'Monthly Entry', icon: CalendarPlus },
  { href: '/ot-entry', label: 'OT Entry', icon: Stethoscope },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile menu toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-slate-800 border border-slate-700 lg:hidden"
        style={{ display: isOpen ? 'none' : 'flex' }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full z-50 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: '260px',
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          borderRight: '1px solid rgba(71, 85, 105, 0.3)',
        }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-6"
          style={{
            height: '72px',
            borderBottom: '1px solid rgba(71, 85, 105, 0.2)',
          }}
        >
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: '38px',
              height: '38px',
              background: 'linear-gradient(135deg, #10b981, #059669)',
            }}
          >
            <Activity size={20} color="white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight">HospitalShare</h1>
            <p className="text-xs text-slate-500">Daily Engine</p>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="ml-auto lg:hidden text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
            Management
          </p>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))'
                    : 'transparent',
                  color: isActive ? '#34d399' : '#94a3b8',
                  borderLeft: isActive ? '3px solid #10b981' : '3px solid transparent',
                }}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div
          className="px-3 py-4"
          style={{ borderTop: '1px solid rgba(71, 85, 105, 0.2)' }}
        >
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all w-full"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
