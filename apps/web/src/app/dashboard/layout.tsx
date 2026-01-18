'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  ChefHat,
  Truck,
  Package,
  BarChart3,
  Users,
  ShoppingBag,
  Settings,
  Menu,
  X,
  LogOut,
  Bell,
  ChevronRight,
  Flame,
} from 'lucide-react';

// Navigation groups
const navigationGroups = [
  {
    label: 'Ana Sayfa',
    items: [
      { name: 'Kontrol Paneli', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { name: 'Siparisler', href: '/dashboard/orders', icon: ClipboardList, badge: true },
      { name: 'Mutfak', href: '/dashboard/kitchen', icon: ChefHat },
      { name: 'Teslimat', href: '/dashboard/delivery', icon: Truck },
    ],
  },
  {
    label: 'Yonetim',
    items: [
      { name: 'Urunler', href: '/dashboard/products', icon: ShoppingBag },
      { name: 'Stok', href: '/dashboard/stock', icon: Package },
      { name: 'Musteriler', href: '/dashboard/customers', icon: Users },
      { name: 'Raporlar', href: '/dashboard/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { name: 'Ayarlar', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const isActiveLink = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] w-72 bg-white dark:bg-gray-900 shadow-2xl lg:shadow-xl transform transition-all duration-300 ease-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Logo Header */}
          <div className="flex h-16 items-center justify-between px-5 border-b border-gray-100 dark:border-gray-800">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30 group-hover:shadow-orange-500/50 transition-shadow">
                  <Flame className="h-5 w-5 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">312 Doner</h1>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yonetim Paneli</p>
              </div>
            </Link>
            <button
              className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin">
            <div className="space-y-6">
              {navigationGroups.map((group, groupIndex) => (
                <div key={group.label}>
                  {/* Section Label */}
                  <div className="px-3 mb-2">
                    <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                      {group.label}
                    </p>
                  </div>

                  {/* Section Items */}
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = isActiveLink(item.href);
                      const Icon = item.icon;

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                            isActive
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                          }`}
                        >
                          {/* Active Indicator */}
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
                          )}

                          <div className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                            isActive
                              ? 'bg-white/20'
                              : 'bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'
                          }`}>
                            <Icon className={`h-5 w-5 ${isActive ? 'text-white' : ''}`} />
                          </div>

                          <span className="flex-1 font-medium text-sm">{item.name}</span>

                          {/* Badge for orders */}
                          {item.badge && (
                            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                            }`}>
                              3
                            </span>
                          )}

                          {/* Hover Arrow */}
                          {!isActive && (
                            <ChevronRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* User Section */}
          <div className="border-t border-gray-100 dark:border-gray-800 p-4">
            {/* User Profile */}
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-2">
              <div className="relative">
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-bold shadow-lg">
                  AY
                </div>
                <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">Admin Yonetici</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">admin@312doner.com</p>
              </div>
              <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors relative">
                <Bell className="h-5 w-5 text-gray-500" />
                <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
              </button>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              <span>Cikis Yap</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="sr-only">Menu ac</span>
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Flame className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900 dark:text-white">312 Doner</span>
        </div>
        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors relative">
          <Bell className="h-5 w-5 text-gray-600 dark:text-gray-400" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        </button>
      </header>

      {/* Main Content */}
      <main className="lg:pl-72 min-h-screen">
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
