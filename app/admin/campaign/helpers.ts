import type * as React from 'react';

/**
 * Minimal RFC-4180 CSV parser. Hand-rolled so we no longer need the
 * `xlsx` dependency (which had an unpatched prototype-pollution advisory).
 */
export function parseCsv(text: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: unknown[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export interface RecipientRow {
  id: number;
  label: string;
  phone: string | null;
  cabang: string | null;
  message: string | null;
  waMessageId: string | null;
  waStatus: 'pending' | 'sent' | 'delivered' | 'read' | string;
  waSentAt: string | null;
  createdAt: string;
  isSubmitted?: boolean;
  formSubmittedAt?: string | null;
}

export const DEFAULT_TEMPLATES = [
  '{Yth.|Dear Sir/Madam} {nama},\n\nRegarding the *update of Bank SulutGo employee position data*, we kindly ask you to confirm your position and work unit through the official portal below:\n\n{link}\n\nPlease complete the confirmation by *today, 4:00 PM WITA* so your position and work unit data are verified.\n\nThank you for your cooperation.\n\n*Human Resources Division*\n*Bank SulutGo*',
  '{Yth.|Dear} {nama},\n\nKami mengingatkan untuk *memperbarui data pegawai Bank SulutGo* melalui portal berikut:\n\n{link}\n\nMohon selesai *hari ini jam 4:00 PM WITA* agar data posisi dan unit kerja Anda terverifikasi.\n\nTerima kasih atas kerja samanya.\n\n*Divisi SDM*\n*Bank SulutGo*',
  '{Yth.|Bapak/Ibu} {nama},\n\nMohon konfirmasi posisi dan unit kerja Anda melalui portal resmi Bank SulutGo:\n\n{link}\n\nBatas waktu: *hari ini jam 4:00 PM WITA*.\n\nTerima kasih atas perhatian dan kerja samanya.\n\n*SDM*\n*Bank SulutGo*',
  '{Yth.|Bapak/Ibu} {nama},\n\nJangan lupa *memperbarui data* posisi dan unit kerja Anda melalui portal berikut:\n\n{link}\n\nMohon diselesaikan sebelum *hari ini jam 4:00 PM WITA*.\n\nTerima kasih atas kerja samanya.\n\n*Divisi Sumber Daya Manusia*\n*Bank SulutGo*',
  '{Yth.|Bapak/Ibu} {nama},\n\nIni adalah pengingat untuk *memperbarui data pegawai* melalui portal Bank SulutGo:\n\n{link}\n\nMohon selesai *hari ini jam 4:00 PM WITA* agar data Anda terverifikasi.\n\nTerima kasih atas perhatian dan kerja samanya.\n\n*SDM*\n*Bank SulutGo*',
];

/** Spintax: replaces {a|b|c} with one random pick; leaves {nama}/{link} intact. */
export function processSpintax(text: string): string {
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  let matches = spintaxRegex.exec(result);
  let iterations = 0;

  while (matches && iterations < 20) {
    iterations++;
    const fullMatch = matches[0];
    const choices = matches[1].split('|');
    const isVariable =
      choices.length === 1 &&
      (choices[0].toLowerCase() === 'nama' || choices[0].toLowerCase() === 'link');
    if (!isVariable) {
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      result = result.replace(fullMatch, chosen);
    }
    matches = spintaxRegex.exec(result);
  }
  return result;
}

export type DelayProfile = 'safe' | 'balanced' | 'fast';

export const WA_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  sending: 'Sending',
  failed: 'Failed',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

export const DELAY_META: Record<DelayProfile, { label: string; range: string }> = {
  safe: { label: 'Safe', range: '60–120s random' },
  balanced: { label: 'Balanced', range: '30–60s random' },
  fast: { label: 'Fast', range: '15–30s' },
};

export const TONE_OK: React.CSSProperties = { background: 'transparent', color: '#e9edef' };
