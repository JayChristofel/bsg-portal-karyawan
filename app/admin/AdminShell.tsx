'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DeviceStatus {
  state?: string;
  connected?: boolean;
  name?: string;
  device?: string;
  error?: string;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [waStatus, setWaStatus] = useState<string>('checking');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const checkWA = async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        const isConnected = Boolean(data?.results?.is_connected || data?.results?.is_logged_in);
        setWaStatus(isConnected ? 'connected' : 'disconnected');
      } else {
        setWaStatus('disconnected');
      }
    } catch {
      setWaStatus('disconnected');
    }
  };

  useEffect(() => {
    checkWA();
    const interval = setInterval(checkWA, 15000); // Poll status every 15s
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  };

  const navItems = [
    { label: 'Overview', href: '/admin', icon: '📊', exact: true },
    { label: 'Data Pegawai', href: '/admin/pegawai', icon: '👥' },
    { label: 'Kampanye Awareness', href: '/admin/campaign', icon: '🎯' },
    { label: 'WhatsApp Gateway', href: '/admin/whatsapp', icon: '📱' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <style>{`
        * { box-sizing: border-box; }
        .sidebar {
          width: 260px;
          background: #1e293b;
          border-right: 1px solid #334155;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
          z-index: 50;
          transition: transform 0.2s ease-in-out;
        }
        @media (max-width: 900px) {
          .sidebar {
            transform: translateX(-100%);
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .main-content {
            margin-left: 0 !important;
          }
          .top-bar-mobile {
            display: flex !important;
          }
        }
        .main-content {
          flex: 1;
          margin-left: 260px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          background: #0f172a;
        }
        .nav-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 8px;
          color: #94a3b8;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s;
          margin-bottom: 4px;
        }
        .nav-link:hover {
          background: #334155;
          color: #f8fafc;
        }
        .nav-link.active {
          background: #0078d4;
          color: #ffffff;
          font-weight: 600;
          box-shadow: 0 4px 12px rgba(0,120,212,0.3);
        }
        .wa-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
        }
        .wa-connected {
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .wa-disconnected {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .wa-checking {
          background: rgba(234, 179, 8, 0.15);
          color: #facc15;
          border: 1px solid rgba(234, 179, 8, 0.3);
        }
        .top-bar-mobile {
          display: none;
          height: 60px;
          background: #1e293b;
          border-bottom: 1px solid #334155;
          padding: 0 16px;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 40;
        }
        .btn-ghost {
          background: transparent;
          border: 1px solid #475569;
          color: #e2e8f0;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-ghost:hover {
          background: #334155;
        }
      `}</style>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Brand */}
        <div style={{ padding: '24px 20px', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'linear-gradient(135deg, #0078d4, #004578)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', boxShadow: '0 2px 8px rgba(0,120,212,0.4)' }}>
              🏢
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#f8fafc', lineHeight: 1.2 }}>Portal Pegawai</div>
              <div style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '0.5px' }}>ADMIN CONSOLE</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, padding: '0 8px 8px 8px', letterSpacing: '0.5px' }}>
            Menu Utama
          </div>
          {navItems.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span style={{ fontSize: '16px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 600, padding: '24px 8px 8px 8px', letterSpacing: '0.5px' }}>
            Akses Eksternal
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            <span style={{ fontSize: '16px' }}>🌐</span>
            <span>Buka Form Publik ↗</span>
          </a>
          <a
            href="/api/export.csv"
            className="nav-link"
            download
          >
            <span style={{ fontSize: '16px' }}>📥</span>
            <span>Export CSV Pegawai</span>
          </a>
        </nav>

        {/* WA Gateway Status in Sidebar */}
        <div style={{ padding: '14px 16px', background: '#0f172a', borderTop: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>WhatsApp Gateway</span>
            <span
              className={`wa-badge ${
                waStatus === 'connected'
                  ? 'wa-connected'
                  : waStatus === 'checking'
                  ? 'wa-checking'
                  : 'wa-disconnected'
              }`}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }}></span>
              {waStatus === 'connected' ? 'Aktif' : waStatus === 'checking' ? 'Cek...' : 'Terputus'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Device: <code>portal-pegawai</code>
          </div>
        </div>

        {/* User Info & Logout */}
        <div style={{ padding: '16px', borderTop: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>
              👤
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>Administrator</div>
              <div style={{ fontSize: '10px', color: '#10b981' }}>● Online</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            style={{ background: '#334155', border: 'none', color: '#ef4444', padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            🚪
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top mobile bar */}
        <div className="top-bar-mobile">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🏢</span>
            <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Portal Pegawai</span>
          </div>
          <button
            className="btn-ghost"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? '✕ Tutup' : '☰ Menu'}
          </button>
        </div>

        {/* Page Content */}
        <main style={{ padding: '28px 32px', flex: 1, overflowX: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
