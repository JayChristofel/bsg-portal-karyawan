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
    <div className="portal-page-wrapper">
      <div className="main-wrapper">
      <div className="form-card">
        {/* ================= 1. COVER VIEW ================= */}
        {currentView === 'cover' && (
          <div id="view-cover">
            <div className="cover-banner-container">
              <div className="cover-banner-bg" />
              <div className="cover-banner-overlay" />

              <div className="cover-badge">
                <div className="cover-badge-icon">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <path d="M9 16l2 2 4-4" />
                  </svg>
                </div>
              </div>

              <div className="card-top-action" title="More options">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </div>
            </div>

            <div className="cover-body">
              <h1 className="cover-title">KONFIRMASI JABATAN & UNIT KERJA</h1>
              <p className="cover-subtitle">PEMUTAKHIRAN DATA PEGAWAI — DIVISI SDM / HUMAN CAPITAL · BANK SULUTGO</p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(255,193,7,0.18)', border: '1px solid rgba(255,193,7,0.5)', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', color: '#ffe082', fontWeight: 600, marginBottom: '18px', backdropFilter: 'blur(4px)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Harap diisi paling lambat hari ini, pukul 16.00 WITA
              </div>
              <button type="button" className="btn-start-now" onClick={handleStart}>
                Mulai Konfirmasi Sekarang
              </button>
            </div>
          </div>
        )}

        {/* ================= 2. FORM VIEW ================= */}
        {currentView === 'form' && (
          <div id="view-form" className="form-view-container" style={{ display: 'block', padding: '22px 18px 28px', position: 'relative' }}>
            <div className="form-header-action" title="More options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </div>

            <h2 className="form-title">Formulir Konfirmasi Jabatan &amp; Unit Kerja</h2>
            <p className="form-disclaimer">
              Isilah data di bawah ini sesuai kondisi jabatan dan unit kerja Anda saat ini. Data digunakan untuk pemutakhiran sistem kepegawaian Bank SulutGo.
            </p>
            <p className="required-badge">* Wajib diisi (Required)</p>

            <form onSubmit={handleSubmit} autoComplete="off">
              {/* Field 1: Nama Lengkap */}
              <div className="question-block">
                <label className="question-label" htmlFor="input-name">
                  1. Nama Lengkap<span className="star">*</span>
                </label>
                <input
                  type="text"
                  id="input-name"
                  className={`text-input ${errors.name ? 'error' : ''}`}
                  placeholder="Masukkan nama lengkap"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, name: false }));
                  }}
                />
                {errors.name && <div className="error-msg" style={{ display: 'block' }}>Nama lengkap wajib diisi.</div>}
              </div>

              {/* Field 2: NIP */}
              <div className="question-block">
                <label className="question-label" htmlFor="input-nip">
                  2. Nomor Induk Kepegawaian<span className="star">*</span>
                </label>
                <input
                  type="text"
                  id="input-nip"
                  className={`text-input ${errors.nip ? 'error' : ''}`}
                  placeholder="Masukkan Nomor Induk Kepegawaian"
                  value={nip}
                  onChange={(e) => {
                    setNip(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, nip: false }));
                  }}
                />
                {errors.nip && <div className="error-msg" style={{ display: 'block' }}>Nomor Induk Kepegawaian wajib diisi.</div>}
              </div>

              {/* Field 3: Jabatan sesuai SK */}
              <div className="question-block">
                <label className="question-label" htmlFor="input-jabatan-sk">
                  3. Jabatan sesuai SK<span className="star">*</span>
                </label>
                <input
                  type="text"
                  id="input-jabatan-sk"
                  className={`text-input ${errors.jabatanSk ? 'error' : ''}`}
                  placeholder="Contoh: Mgr / Realtion Officer"
                  value={jabatanSk}
                  onChange={(e) => {
                    setJabatanSk(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, jabatanSk: false }));
                  }}
                />
                {errors.jabatanSk && <div className="error-msg" style={{ display: 'block' }}>Jabatan sesuai SK wajib diisi.</div>}
              </div>

              {/* Field 4: Jabatan saat ini */}
              <div className="question-block">
                <label className="question-label" htmlFor="input-jabatan-sekarang">
                  4. Jabatan saat ini<span className="star">*</span>
                </label>
                <input
                  type="text"
                  id="input-jabatan-sekarang"
                  className={`text-input ${errors.jabatanSekarang ? 'error' : ''}`}
                  placeholder="Contoh: Customer Service / Teller"
                  value={jabatanSekarang}
                  onChange={(e) => {
                    setJabatanSekarang(e.target.value);
                    if (e.target.value.trim()) setErrors((prev) => ({ ...prev, jabatanSekarang: false }));
                  }}
                />
                {errors.jabatanSekarang && <div className="error-msg" style={{ display: 'block' }}>Jabatan saat ini wajib diisi.</div>}
              </div>

              {/* Field 5: Kantor Cabang / KCP */}
              <div className="question-block">
                <label className="question-label">
                  5. Kantor Cabang / KCP<span className="star">*</span>
                </label>

                <div className="dropdown-container" ref={dropdownRef}>
                  <div
                    className={`dropdown-trigger ${!cabang ? 'placeholder' : ''} ${isDropdownOpen ? 'active' : ''} ${errors.cabang ? 'error' : ''}`}
                    tabIndex={0}
                    role="combobox"
                    aria-expanded={isDropdownOpen}
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <span>{cabang || 'Pilih Kantor Cabang / KCP'}</span>
                    <svg className="dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {isDropdownOpen && (
                    <div className="dropdown-menu open">
                      <div className="dropdown-search-wrap" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={searchInputRef}
                          type="text"
                          className="dropdown-search-input"
                          placeholder="Cari cabang / KCP..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>

                      <ul style={{ listStyle: 'none' }}>
                        {Object.entries(CABANG_GROUPS).map(([groupTitle, items]) => {
                          const filteredItems = items.filter((c) =>
                            c.toLowerCase().includes(normalizedQuery)
                          );
                          if (filteredItems.length === 0) return null;

                          return (
                            <React.Fragment key={groupTitle}>
                              {!normalizedQuery && (
                                <li className="dropdown-group-header">{groupTitle}</li>
                              )}
                              {filteredItems.map((c) => (
                                <li
                                  key={c}
                                  className={`dropdown-option ${cabang === c ? 'selected' : ''}`}
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
                {errors.cabang && <div className="error-msg" style={{ display: 'block' }}>Kantor Cabang wajib dipilih.</div>}
              </div>

              <button type="submit" className="btn-submit" disabled={isSubmitting}>
                {isSubmitting ? 'Menyimpan Data...' : 'Kirim Konfirmasi'}
              </button>
            </form>
          </div>
        )}

        {/* ================= 3. SUCCESS VIEW ================= */}
        {currentView === 'success' && (
          <div id="view-success" className="success-view-container" style={{ display: 'block', padding: '28px 18px 24px', position: 'relative' }}>
            <div className="success-top-action" title="More options">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </div>

            <div className="success-icon-wrap">
              <img src="/assets/checkmark.png" alt="Success Checkmark" className="success-icon-img" />
            </div>

            <h3 className="success-message">Konfirmasi berhasil dikirim. Terima kasih!</h3>
            <p className="success-time-info">{successTime}</p>

            <div className="divider-with-text">
              <span>Tindakan Lanjutan</span>
            </div>

            <button type="button" className="btn-save-response" onClick={() => window.print()}>
              Simpan / Cetak Bukti Konfirmasi Jabatan
            </button>
            <a className="link-submit-another" onClick={handleResetForm}>
              Kirim respons data lainnya
            </a>

            <div className="promo-card">
              <div className="promo-heading">Microsoft Forms Enterprise</div>
              <div className="promo-subheading">Sistem Pemutakhiran Data &amp; Survei Internal Pegawai</div>

              <div className="promo-img-wrap">
                <img src="/assets/promo.jpg" alt="Event registration" className="promo-img" />
              </div>

              <a href="#" className="btn-promo-start">
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
      <footer className="ms-footer">
        <div className="ms-branding">
          <div className="ms-logo-grid">
            <div className="ms-logo-square" style={{ background: '#f25022' }} />
            <div className="ms-logo-square" style={{ background: '#7fba00' }} />
            <div className="ms-logo-square" style={{ background: '#00a4ef' }} />
            <div className="ms-logo-square" style={{ background: '#ffb900' }} />
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
