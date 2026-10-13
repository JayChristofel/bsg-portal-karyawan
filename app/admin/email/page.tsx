'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/app/admin/components/ui';
import { MetricCard } from '@/app/admin/components/ui';
import { EmptyState } from '@/app/admin/components/ui';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Eye } from 'lucide-react';

export default function EmailDashboard() {
  const [campaigns, setCampaigns] = useState<Array<{
    id: number;
    name: string;
    subject: string;
    status: string;
    totalRecipients: number;
    sentCount: number;
    failCount: number;
  }>>([]);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/campaigns', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns ?? []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center px-6">
        <Skeleton className="animate-bounce" />
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={() => <Eye className="size-6 text-emerald-500" />}
        title="Belum Ada Kampanye Email"
        description="Buat kampanye email pertama Anda untuk memulai broadcast ke pegawai."
        action={['Buat Kampanye', '/admin/email/campaigns']}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="flex flex-col sm:flex-row gap-3 pb-4">
        <h1 className="flex-1 text-[20px] font-semibold tracking-widest uppercase text-chart-1">Dashboard Email</h1>
        <Button
          variant="primary"
          onClick={() => window.location.href = '/admin/email/campaigns'}
        >
          Buat Kampanye
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Kampanye"
          value={campaigns.length.toString()}
          hint="semua kampanye"
          icon={() => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 13h2v6H3v-6zm4-7V5h2v3h-2V5zm4 14h2v3h-2v-3zm-5 5c0-1.1.9-2 2-2s2 .9 2 2h-3v-2h3c1.1 0 2-.9 2-2s-.9-2-2-2h-3v2H8z" />
          </svg>}
        />
        <MetricCard
          title="Total Terkirim"
          value={campaigns.reduce((sum, c) => sum + c.sentCount, 0).toString()}
          hint="total email terkirim"
          icon={() => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 7H3v2h18v-2zm0 4H3v2h18v-2zm0 4H3v2h18v-2zm-7-5c0-1.1.9-2 2-2s2.01 .89 2 2h3v-2H8c-1.1 0-2 .9-2 2s.9 2 2 2h3v-2H8z" />
          </svg>}
        />
        <MetricCard
          title="Gagal"
          value={campaigns.reduce((sum, c) => sum + c.failCount, 0).toString()}
          hint="total email gagal terkirim"
          icon={() => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5v14M5 12h14" />
          </svg>}
        />
        <MetricCard
          title="Gauge"
          value="--"
          hint="pending"
          icon={() => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5v14M5 12h14" />
          </svg>}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Rincian Kampanye</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kampanye</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Terkirim</TableHead>
              <TableHead>Gagal</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          {campaigns.map((c) => (
            <TableRow key={c.id} className="hover:bg-chart-2/10">
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.subject}</TableCell>
              <TableCell><StatusBadge status={c.status} /></TableCell>
              <TableCell>{c.totalRecipients}</TableCell>
              <TableCell>{c.sentCount}</TableCell>
              <TableCell>{c.failCount}</TableCell>
              <TableCell>
                <Button size="sm" variant="outline">
                  Lihat
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </div>
    </div>
  );
}