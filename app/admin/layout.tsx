import type { Metadata } from 'next';
import AdminShell from './AdminShell';
import './admin.css';

export const metadata: Metadata = {
  title: 'Admin Dashboard — Employee Portal',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
