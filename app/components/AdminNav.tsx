'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav() {
  const pathname = usePathname();

  const navItems = [
    { name: '📦 Pedidos', path: '/gestion-pedidos' },
    { name: '📋 Stock', path: '/gestion-stock' },
    { name: '👥 Personal', path: '/gestion-personal' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 mb-6 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex-1 py-4 text-center font-bold text-sm sm:text-base transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
