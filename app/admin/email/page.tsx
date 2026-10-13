'use client';

import * as React from 'react';
import { ClipboardList, Mail, Send, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageHeader, StatStrip, StatusBadge } from '../components/ui';
import { Table, TableHeader, TableRow, TableHead, TableCell } from '@/components/ui/table';

interface EmailCampaign {
  id: number;
  name: string;
  subject: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failCount: number;
}

export default function EmailDashboard() {
  const [campaigns, setCampaigns] = React.useState<EmailCampaign[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchCampaigns = React.useCallback(async () => {
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
  }, []);

  React.useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0);
  const totalFailed = campaigns.reduce((sum, c) => sum + c.failCount, 0);
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.totalRecipients, 0);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Email Broadcast"
        description="Kelola kampanye email, template, dan pantau pengiriman."
        actions={
          <Button asChild>
            <a href="/admin/email/campaigns">Lihat Campaigns</a>
          </Button>
        }
      />

      <StatStrip
        className="mb-4"
        loading={isLoading}
        items={[
          { label: 'Campaigns', value: campaigns.length, icon: ClipboardList },
          { label: 'Recipients', value: totalRecipients, icon: Mail },
          { label: 'Sent', value: totalSent, icon: Send },
          { label: 'Failed', value: totalFailed, icon: XCircle },
        ]}
      />

      {isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass rounded-xl">
          <EmptyState
            icon={Mail}
            title="Belum ada kampanye email"
            description="Buat kampanye email pertama Anda untuk memulai broadcast ke pegawai."
            action={{ label: 'Buat Kampanye', href: '/admin/email/campaigns' }}
          />
        </div>
      ) : (
        <div className="glass overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kampanye</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Terkirim</TableHead>
                  <TableHead>Gagal</TableHead>
                </TableRow>
              </TableHeader>
              {campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.subject}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="tabular">{c.totalRecipients}</TableCell>
                  <TableCell className="tabular">{c.sentCount}</TableCell>
                  <TableCell className="tabular">{c.failCount}</TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
