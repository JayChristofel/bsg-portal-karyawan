'use client';

import * as React from 'react';
import { CheckCircle2, Eye, EyeOff, Save, Send, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader, SectionCard } from '../../components/ui';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  apiKey: string;
  hasPassword?: boolean;
  hasApiKey?: boolean;
  fromEmail: string;
  fromName: string;
}

export default function EmailConfigPage() {
  const [config, setConfig] = React.useState<EmailConfig>({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    apiKey: '',
    fromEmail: '',
    fromName: '',
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [testEmail, setTestEmail] = React.useState('');
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const fetchConfig = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/email/config', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
      }
    } catch (err) {
      console.error('Fetch config error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (res.ok) {
        setNotice({ tone: 'ok', text: 'Konfigurasi SMTP berhasil disimpan.' });
        void fetchConfig();
      } else {
        setNotice({ tone: 'err', text: data.error || 'Could not save configuration.' });
      }
    } catch (err) {
      setNotice({ tone: 'err', text: `Error: ${(err as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      setTestResult({ ok: false, message: 'Masukkan email tujuan untuk test.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          subject: 'Test Email from Portal Pegawai',
          html: '<h1>Test Email</h1><p>Email ini dikirim sebagai tes konfigurasi SMTP.</p>',
          text: 'Test Email from Portal Pegawai',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ ok: true, message: 'Email test berhasil dikirim.' });
      } else {
        setTestResult({ ok: false, message: data.error || 'Gagal mengirim email test.' });
      }
    } catch (err) {
      setTestResult({ ok: false, message: `Error: ${(err as Error).message}` });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader title="Email Configuration" description="Konfigurasi SMTP server untuk email broadcast." />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true">
          <div className="glass h-80 animate-pulse rounded-xl" />
          <div className="glass h-80 animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Email Configuration"
        description="Konfigurasi SMTP server untuk mengirim email broadcast ke pegawai."
      />

      {notice ? (
        <div
          role="status"
          className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-chart-2/30 bg-chart-2/10 text-chart-2'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="cursor-pointer opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            <XCircle className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="SMTP Server" description="Konfigurasi koneksi ke SMTP server.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-host">SMTP Host</Label>
              <Input
                id="smtp-host"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="e.g. smtp.gmail.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="smtp-port">Port</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  value={config.port}
                  onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="smtp-secure">Connection</Label>
                <Select
                  value={config.secure ? 'true' : 'false'}
                  onValueChange={(v) => setConfig({ ...config, secure: v === 'true' })}
                >
                  <SelectTrigger id="smtp-secure">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">STARTTLS (587)</SelectItem>
                    <SelectItem value="true">SSL/TLS (465)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-username">SMTP Username</Label>
              <Input
                id="smtp-username"
                value={config.username}
                onChange={(e) => setConfig({ ...config, username: e.target.value })}
                placeholder="e.g. noreply@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-password">SMTP Password</Label>
              <div className="relative">
                <Input
                  id="smtp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={config.password}
                  onChange={(e) => setConfig({ ...config, password: e.target.value })}
                  placeholder={config.hasPassword ? 'Tersimpan — kosongkan jika tidak diubah' : '••••••••'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Sender Identity" description="Identitas pengirim email.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-email">From Email</Label>
              <Input
                id="smtp-from-email"
                type="email"
                value={config.fromEmail}
                onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                placeholder="e.g. noreply@company.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="smtp-from-name">From Name</Label>
              <Input
                id="smtp-from-name"
                value={config.fromName}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                placeholder="e.g. Portal Pegawai"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => void fetchConfig()}
        >
          Reset
        </Button>
        <Button onClick={() => void handleSave()} disabled={isSaving}>
          <Save className="size-3.5" aria-hidden="true" />
          {isSaving ? 'Saving…' : 'Save Configuration'}
        </Button>
      </div>

      <SectionCard
        className="mt-6"
        title="Test Connection"
        description="Kirim email test untuk memastikan konfigurasi SMTP sudah benar."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="test-email">Test Email Address</Label>
            <Input
              id="test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="e.g. admin@company.com"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => void handleTest()}
            disabled={isTesting || !config.host}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {isTesting ? 'Sending…' : 'Send Test'}
          </Button>
        </div>

        {testResult ? (
          <div
            role="status"
            className={`mt-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              testResult.ok
                ? 'border-chart-2/30 bg-chart-2/10 text-chart-2'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            ) : (
              <XCircle className="size-4" aria-hidden="true" />
            )}
            {testResult.message}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}
