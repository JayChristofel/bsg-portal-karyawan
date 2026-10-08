'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.success) {
        router.push(data.redirect || '/admin');
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch {
      setError('A network error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <style>{`
        body {
          font-family: "Segoe UI", sans-serif;
          background: #0f172a;
          margin: 0;
          padding: 0;
        }
        .login-page-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: #0f172a;
          font-family: "Segoe UI", sans-serif;
          box-sizing: border-box;
        }
        .box {
          position: relative;
          z-index: 1;
          background: #fff;
          width: 100%;
          max-width: 360px;
          border-radius: 12px;
          box-shadow: 0 10px 32px rgba(0,0,0,.35);
          padding: 32px 28px;
        }
        h1 {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 18px;
          color: #0f172a;
          margin: 0 0 20px;
          text-align: center;
        }
        h1 svg {
          width: 18px;
          height: 18px;
          color: #059669;
        }
        label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
        }
        input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 16px;
          box-sizing: border-box;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s;
        }
        input:focus { border-color: #0078d4; }
        button {
          width: 100%;
          padding: 11px;
          background: #0078d4;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        button:hover { background: #106ebe; }
        button:disabled { background: #c8c6c4; cursor: not-allowed; }
        .error {
          color: #a80000;
          font-size: 13px;
          margin-bottom: 12px;
          padding: 8px 10px;
          background: #fff8f8;
          border-radius: 6px;
          border: 1px solid #fecaca;
        }
      `}</style>

      <div className="login-page-container">
        <form className="box" onSubmit={handleSubmit}>
          <h1>
            <Lock aria-hidden="true" />
            Admin Login
          </h1>
          {error && <div className="error">{error}</div>}
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Verifying…' : 'Login'}
          </button>
        </form>
      </div>
    </>
  );
}
