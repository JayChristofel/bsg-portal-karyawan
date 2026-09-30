import type { Metadata, Viewport } from 'next';
import './portal.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Form Data Karyawan',
  description: 'Portal Pengkinian Data Pegawai — Divisi Human Capital',
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='11' height='11' fill='%23f25022'/><rect x='13' width='11' height='11' fill='%237fba00'/><rect y='13' width='11' height='11' fill='%2300a4ef'/><rect x='13' y='13' width='11' height='11' fill='%23ffb900'/></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0, minHeight: '100vh', background: '#0f172a' }}>
        {children}
      </body>
    </html>
  );
}
