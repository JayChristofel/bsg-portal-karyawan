import type { Metadata } from 'next';
import AdminShell from './AdminShell';
import './admin.css';

export const metadata: Metadata = {
  title: 'Admin Dashboard — Employee Portal',
};

/**
 * Applied before first paint so the admin never flashes the wrong theme.
 *
 * The theme lives on <html> rather than on the shell div: Radix renders
 * dialogs, popovers, selects and tooltips into <body>, outside the shell, so a
 * class scoped to the shell left every overlay stuck on the light palette.
 */
const THEME_BOOTSTRAP = `
(function () {
  try {
    var stored = localStorage.getItem('admin:theme');
    var theme = stored === 'light' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
