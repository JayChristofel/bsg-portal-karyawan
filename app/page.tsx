'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CABANG_GROUPS } from '@/lib/cabang';

export default function PortalPage() {
  // View state: 'cover' | 'form' | 'success'
  const [currentView, setCurrentView] = useState<'cover' | 'form' | 'success'>('cover');

  // Form inputs
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const [jabatanSk, setJabatanSk] = useState('');
  const [jabatanSekarang, setJabatanSekarang] = useState('');
  const [cabang, setCabang] = useState('');

  // Error states
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Dropdown UI state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Submit status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successTime, setSuccessTime] = useState('');

  // Telemetry references
  const startTimeRef = useRef<number>(Date.now());
  const sessionIdRef = useRef<string>('');

  useEffect(() => {
    try {
      let sid = sessionStorage.getItem('bsg_portal_session');
      if (!sid) {
        sid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Math.random().toString(36).slice(2)}_${Date.now()}`;
        sessionStorage.setItem('bsg_portal_session', sid);
      }
      sessionIdRef.current = sid;
    } catch {
      sessionIdRef.current = `sess_${Date.now()}`;
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard escape for dropdown
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isDropdownOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isDropdownOpen]);

  // Transition to form view
  const handleStart = () => {
    setCurrentView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectCabang = (value: string) => {
    setCabang(value);
    setErrors((prev) => ({ ...prev, cabang: false }));
    setIsDropdownOpen(false);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const newErrors: Record<string, boolean> = {
      name: !name.trim(),
      nip: !nip.trim(),
      jabatanSk: !jabatanSk.trim(),
      jabatanSekarang: !jabatanSekarang.trim(),
      cabang: !cabang.trim(),
    };

    setErrors(newErrors);

    if (Object.values(newErrors).some(Boolean)) {
      return;
    }

    setIsSubmitting(true);
    const now = new Date();
    const timeFormatted = now.toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Compute telemetry data
    const timeOnPage = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
    const screenRes = typeof window !== 'undefined' ? `${window.screen?.width || 0}×${window.screen?.height || 0}` : '-';
    const lang = typeof navigator !== 'undefined' ? (navigator.language || 'id-ID') : 'id-ID';
    const ref = typeof document !== 'undefined' ? (document.referrer || 'Direct / WhatsApp') : 'Direct';
    
    let connType = 'Wi-Fi / Cellular';
    if (typeof navigator !== 'undefined' && (navigator as any).connection) {
      const conn = (navigator as any).connection;
      connType = conn.effectiveType ? `${conn.effectiveType.toUpperCase()} (${conn.type || 'network'})` : conn.type || connType;
    }

    try {
      await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          nip: nip.trim(),
          jabatan_sk: jabatanSk.trim(),
          jabatan_sekarang: jabatanSekarang.trim(),
          cabang: cabang.trim(),
          screen_resolution: screenRes,
          language: lang,
          referrer: ref,
          session_id: sessionIdRef.current,
          time_on_page: timeOnPage,
          page_path: typeof window !== 'undefined' ? window.location.pathname : '/',
          connection_type: connType,
          event: 'submit',
        }),
      });
    } catch (err) {
      console.warn('Submit notice:', err);
    } finally {
      setIsSubmitting(false);
      setSuccessTime(`Tercatat pada: ${timeFormatted}`);
      setCurrentView('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleResetForm = () => {
    setName('');
    setNip('');
    setJabatanSk('');
    setJabatanSekarang('');
    setCabang('');
    setErrors({});
    setCurrentView('form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const normalizedQuery = searchQuery.toLowerCase().trim();

  return (
    <div className="portal-page-wrapper relative flex min-h-screen flex-col items-center justify-start overflow-x-hidden bg-[#1e293b] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_50%,#334155_100%)] px-2.5 pt-3 pb-9 font-portal text-portal-text sm:px-4 sm:pt-6 sm:pb-10 lg:px-5 lg:pt-10 lg:pb-[60px]">
      <div className="relative z-1 mx-auto flex w-full max-w-full flex-col items-center transition-[max-width] duration-300 sm:max-w-[560px] lg:max-w-[640px]">
      <div className="mb-6 w-full overflow-visible rounded-[12px] bg-portal-card shadow-[0_10px_32px_rgba(0,0,0,0.35)] animate-fade-in sm:rounded-[14px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.4)] lg:rounded-[16px] lg:shadow-[0_18px_52px_rgba(0,0,0,0.45)]">
        {/* ================= 1. COVER VIEW ================= */}
        {currentView === 'cover' && (
          <div id="view-cover">
            <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded-t-[12px] bg-[linear-gradient(135deg,#004e8c_0%,#0078d4_50%,#50e6ff_100%)] sm:h-[240px] lg:h-[280px]">
              <div className="absolute inset-0 bg-[url('/assets/BSGO.jpg')] bg-cover bg-center brightness-[0.65] saturate-[1.2]" />
              <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,78,140,0.4)_0%,rgba(15,23,42,0.75)_100%)]" />
              <div className="absolute top-3 right-3 z-3 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-[4px] transition-colors duration-200" title="More options">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col items-center px-5 pt-7 pb-8 text-center sm:px-8 sm:pt-9 sm:pb-10 lg:px-11 lg:pt-[42px] lg:pb-12">
              <h1 className="mb-3 text-[22px] leading-[1.3] font-bold tracking-[-0.2px] text-portal-text sm:text-[26px] lg:mb-3.5 lg:text-[28px]">JABATAN & UNIT KERJA</h1>
              <p className="mb-[18px] text-[13px] font-semibold tracking-[0.8px] text-portal-text-sub uppercase lg:mb-[22px] lg:text-[14px]">DIVISI HUMAN CAPITAL · BANK SULUTGO</p>
              <div className="mb-[18px] inline-flex items-center gap-[7px] rounded-[6px] border border-[rgba(255,193,7,0.5)] bg-[rgba(255,193,7,0.18)] px-3.5 py-1.5 text-[12px] font-semibold text-[#ffe082] backdrop-blur-[4px]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Harap diisi paling lambat hari ini, pukul 16.00 WITA
              </div>
              <button type="button" className="cursor-pointer rounded-[6px] border-none bg-portal-primary px-12 py-3 text-[15px] font-semibold text-white shadow-[0_3px_10px_rgba(0,120,212,0.35)] transition-[background,transform,box-shadow] duration-200 hover:bg-portal-primary-hover hover:shadow-[0_4px_14px_rgba(0,120,212,0.45)] active:scale-[0.98] lg:px-14 lg:py-[13px] lg:text-[16px]" onClick={handleStart}>
                Mulai
              </button>
            </div>
          </div>
        )}

        {/* ================= 2. FORM VIEW ================= */}
        {currentView === 'form' && (
          <div id="view-form" className="relative block px-[18px] pt-[22px] pb-7">
            <div className="absolute top-4 right-4 z-3 flex size-[30px] cursor-pointer items-center justify-center rounded-full text-portal-text-sub transition-colors duration-200 hover:bg-black/5" title="More options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </div>

            <h2 className="mb-3 pr-9 text-[20px] leading-[1.3] font-bold text-portal-text sm:text-[22px] lg:text-[24px]">Formulir Jabatan &amp; Unit Kerja</h2>
            <p className="mb-3.5 text-[13px] leading-[1.45] text-portal-text-disclaimer">
              Isilah data di bawah ini sesuai jabatan dan unit kerja Anda saat ini. Data digunakan untuk pemutakhiran sistem kepegawaian Bank SulutGo.
            </p>
            <p className="mb-[22px] text-[13px] font-medium text-portal-error">* Wajib diisi (Required)</p>

            <form onSubmit={handleSubmit} autoComplete="off">
              {/* Field 1: Nama Lengkap */}
              <div className="mb-6">
                <label className="mb-2.5 block text-[15px] leading-[1.35] font-semibold text-portal-text sm:text-[16px]" htmlFor="input-name">
                  1. Nama Lengkap<span className="ml-0.5 text-portal-error">*</span>
                </label>
                <input
                  type="text"
                  id="input-name"
                  className={`h-11 w-full rounded-[4px] border border-portal-border-input bg-white px-3 text-[14px] font-inherit text-portal-text outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[14px] placeholder:text-[#707070] focus:border-portal-border-focus focus:shadow-[0_0_0_1px_var(--color-portal-border-focus)] sm:h-[46px] sm:text-[15px] ${errors.name ? 'border-portal-error bg-portal-bg-error' : ''}`}
                  placeholder="Masukkan nama lengkap"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, name: false }));
                  }}
                />
                {errors.name && <div className="mt-1.5 block text-[12px] text-portal-error">Nama lengkap wajib diisi.</div>}
              </div>

              {/* Field 2: NIP */}
              <div className="mb-6">
                <label className="mb-2.5 block text-[15px] leading-[1.35] font-semibold text-portal-text sm:text-[16px]" htmlFor="input-nip">
                  2. Nomor Induk Karyawan<span className="ml-0.5 text-portal-error">*</span>
                </label>
                <input
                  type="text"
                  id="input-nip"
                  className={`h-11 w-full rounded-[4px] border border-portal-border-input bg-white px-3 text-[14px] font-inherit text-portal-text outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[14px] placeholder:text-[#707070] focus:border-portal-border-focus focus:shadow-[0_0_0_1px_var(--color-portal-border-focus)] sm:h-[46px] sm:text-[15px] ${errors.nip ? 'border-portal-error bg-portal-bg-error' : ''}`}
                  placeholder="Masukkan Nomor Induk Karyawan"
                  value={nip}
                  onChange={(e) => {
                    setNip(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, nip: false }));
                  }}
                />
                {errors.nip && <div className="mt-1.5 block text-[12px] text-portal-error">Nomor Induk Karyawan wajib diisi.</div>}
              </div>

              {/* Field 3: Jabatan sesuai SK */}
              <div className="mb-6">
                <label className="mb-2.5 block text-[15px] leading-[1.35] font-semibold text-portal-text sm:text-[16px]" htmlFor="input-jabatan-sk">
                  3. Jabatan sesuai SK<span className="ml-0.5 text-portal-error">*</span>
                </label>
                <input
                  type="text"
                  id="input-jabatan-sk"
                  className={`h-11 w-full rounded-[4px] border border-portal-border-input bg-white px-3 text-[14px] font-inherit text-portal-text outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[14px] placeholder:text-[#707070] focus:border-portal-border-focus focus:shadow-[0_0_0_1px_var(--color-portal-border-focus)] sm:h-[46px] sm:text-[15px] ${errors.jabatanSk ? 'border-portal-error bg-portal-bg-error' : ''}`}
                  placeholder="Contoh: Mgr / Realtion Officer"
                  value={jabatanSk}
                  onChange={(e) => {
                    setJabatanSk(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, jabatanSk: false }));
                  }}
                />
                {errors.jabatanSk && <div className="mt-1.5 block text-[12px] text-portal-error">Jabatan sesuai SK wajib diisi.</div>}
              </div>

              {/* Field 4: Jabatan saat ini */}
              <div className="mb-6">
                <label className="mb-2.5 block text-[15px] leading-[1.35] font-semibold text-portal-text sm:text-[16px]" htmlFor="input-jabatan-sekarang">
                  4. Jabatan saat ini<span className="ml-0.5 text-portal-error">*</span>
                </label>
                <input
                  type="text"
                  id="input-jabatan-sekarang"
                  className={`h-11 w-full rounded-[4px] border border-portal-border-input bg-white px-3 text-[14px] font-inherit text-portal-text outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[14px] placeholder:text-[#707070] focus:border-portal-border-focus focus:shadow-[0_0_0_1px_var(--color-portal-border-focus)] sm:h-[46px] sm:text-[15px] ${errors.jabatanSekarang ? 'border-portal-error bg-portal-bg-error' : ''}`}
                  placeholder="Contoh: Customer Service / Teller"
                  value={jabatanSekarang}
                  onChange={(e) => {
                    setJabatanSekarang(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, jabatanSekarang: false }));
                  }}
                />
                {errors.jabatanSekarang && <div className="mt-1.5 block text-[12px] text-portal-error">Jabatan saat ini wajib diisi.</div>}
              </div>

              {/* Field 5: Kantor Cabang / KCP */}
              <div className="mb-6">
                <label className="mb-2.5 block text-[15px] leading-[1.35] font-semibold text-portal-text sm:text-[16px]">
                  5. Unit Kerja<span className="ml-0.5 text-portal-error">*</span>
                </label>

                <div className="relative w-full" ref={dropdownRef}>
                  <div
                    className={`flex h-11 w-full cursor-pointer select-none items-center justify-between rounded-[4px] border border-portal-border-input bg-white px-3.5 text-[14px] text-portal-text transition-[border-color,box-shadow] duration-200 focus:border-portal-border-focus focus:shadow-[0_0_0_1px_var(--color-portal-border-focus)] ${!cabang ? 'text-[#707070]' : ''} ${errors.cabang ? 'border-portal-error bg-portal-bg-error' : ''}`}
                    tabIndex={0}
                    role="combobox"
                    aria-expanded={isDropdownOpen}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <span>{cabang || 'Pilih Kantor Cabang / KCP'}</span>
                    <svg className={`size-4 shrink-0 text-portal-text-sub transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute top-[calc(100%+4px)] right-0 left-0 z-200 max-h-[290px] overflow-y-auto rounded-[6px] border border-[#d1d1d1] bg-white py-1.5 shadow-[0_10px_28px_rgba(0,0,0,0.22)] list-none animate-fade-in-menu">
                      <div className="sticky top-0 z-2 border-b border-[#edebe9] bg-white px-2.5 pt-1 pb-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={searchInputRef}
                          type="text"
                          className="h-[34px] w-full rounded-[4px] border border-[#c8c6c4] bg-white px-2.5 text-[13px] font-inherit text-portal-text outline-none transition-colors duration-200 focus:border-portal-border-focus"
                          placeholder="Cari cabang / KCP..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <ul className="list-none">
                        {Object.entries(CABANG_GROUPS).map(([groupTitle, items]) => {
                          const filteredItems = items.filter((c) =>
                            c.toLowerCase().includes(normalizedQuery)
                          );
                          if (filteredItems.length === 0) return null;

                          return (
                            <React.Fragment key={groupTitle}>
                              {!normalizedQuery && (
                                <li className="pointer-events-none select-none bg-[#f8fafc] px-3.5 py-1.5 text-[11px] font-bold tracking-[0.5px] text-[#64748b] uppercase">{groupTitle}</li>
                              )}
                              {filteredItems.map((c) => (
                                <li
                                  key={c}
                                  className={`flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-[14px] text-portal-text transition-colors duration-150 hover:bg-[#f3f2f1] ${cabang === c ? 'bg-[#edebe9] font-semibold' : ''}`}
                                  onClick={() => handleSelectCabang(c)}
                                >
                                  {c === 'Other' ? 'Cabang / KCP Lainnya (Other)' : c}
                                </li>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                {errors.cabang && <div className="mt-1.5 block text-[12px] text-portal-error">Kantor Cabang wajib dipilih.</div>}
              </div>

              <button type="submit" className="w-full cursor-pointer rounded-[6px] border-none bg-portal-primary py-[13px] text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(0,120,212,0.3)] transition-[background,box-shadow,transform] duration-200 hover:bg-portal-primary-hover hover:shadow-[0_4px_12px_rgba(0,120,212,0.4)] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c8c6c4] lg:py-3.5 lg:text-[16px]" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Data...' : 'Kirim'}
              </button>
            </form>
          </div>
        )}

        {/* ================= 3. SUCCESS VIEW ================= */}
        {currentView === 'success' && (
          <div id="view-success" className="relative block px-[18px] pt-7 pb-6">
            <div className="absolute top-4 right-4 z-3 flex size-[30px] cursor-pointer items-center justify-center rounded-full text-portal-text-sub transition-colors duration-200 hover:bg-black/5" title="More options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </div>

            <div className="mt-2 mb-4 flex justify-center">
              <img src="/assets/checkmark.png" alt="Success Checkmark" className="size-12 object-contain" />
            </div>

            <h3 className="mb-2 text-center text-[17px] leading-[1.4] font-semibold text-portal-text sm:text-[18px] lg:text-[20px]">Data berhasil dikirim. Terima kasih!</h3>
            <p className="mb-[22px] text-center text-[13px] text-portal-text-sub">{successTime}</p>

            <div className="divider-with-text my-[18px] mb-4 flex items-center text-center text-[12px] text-portal-text-sub">
              <span>Tindakan Lanjutan</span>
            </div>

            <button type="button" className="mb-4 w-full cursor-pointer rounded-[6px] border border-[#616161] bg-white py-2.5 text-[14px] font-semibold text-portal-text transition-[background,border-color] duration-150 hover:border-[#323130] hover:bg-[#f3f2f1]" onClick={() => window.print()}>
              Simpan / Cetak Bukti Data Jabatan
            </button>
            <a className="mb-[26px] block cursor-pointer text-center text-[13px] font-medium text-portal-primary underline hover:text-portal-dark" onClick={handleResetForm}>
              Kirim respons data lainnya
            </a>

            <div className="px-5 pt-6 pb-[22px]">
              <div className="mb-1 text-[14px] font-semibold text-portal-text">Microsoft Forms Enterprise</div>
              <div className="mb-4 text-[13px] font-semibold text-portal-text">Sistem Pemutakhiran Data &amp; Survei Internal Pegawai</div>

              <div className="mb-[18px] w-[175px] overflow-hidden rounded-[8px] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
                <img src="/assets/promo.jpg" alt="Event registration" className="block w-full" />
              </div>

              <a href="#" className="inline-flex cursor-pointer items-center gap-1.5 rounded-[20px] border border-white bg-white px-[26px] py-[9px] text-[13px] font-semibold text-[#005a9e] no-underline shadow-[0_2px_6px_rgba(0,0,0,0.06)] transition-colors duration-150 hover:bg-[#f3f2f1]">
                Pelajari Selengkapnya
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Microsoft 365 Footer */}
      <footer className="w-full px-2 text-left text-[12px] leading-[1.45] text-white text-shadow-[0_1px_2px_rgba(0,0,0,0.8)] [&_p]:mb-2.5 [&_a]:cursor-pointer [&_a]:text-[#8be4ff] [&_a]:underline hover:[&_a]:text-white">
        <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-white text-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          <div className="grid grid-cols-[repeat(2,8px)] gap-0.5">
            <div className="size-2 bg-[#f25022]" />
            <div className="size-2 bg-[#7fba00]" />
            <div className="size-2 bg-[#00a4ef]" />
            <div className="size-2 bg-[#ffb900]" />
          </div>
          <span>Microsoft 365</span>
        </div>
        <p>
          Konten formulir ini dibuat untuk keperluan internal organisasi. Data yang Anda kirimkan dicatat secara aman dalam sistem kepegawaian perusahaan. Jangan pernah membagikan kata sandi Anda. <a href="#">Laporkan penyalahgunaan</a>
        </p>
        <p>
          Microsoft Forms | AI-Powered surveys, quizzes and polls <a href="#">Buat formulir saya sendiri</a>
        </p>
        <p>
          Pernyataan Privasi & Keamanan Data Internal Perusahaan | <a href="#">Privasi Kesehatan Konsumen</a> | <a href="#">Ketentuan Penggunaan</a>
        </p>
      </footer>
    </div>
  </div>
  );
}
