'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ApiError, auth } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';

function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { mfaRequired } = await auth.login(email, password);
      router.replace(mfaRequired ? `/login/mfa?next=${encodeURIComponent(next)}` : next);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Demasiados intentos. Esperá unos minutos y probá de nuevo.' : (err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Entrar" intro="Tus papeles y vencimientos, en un solo lugar.">
      <form onSubmit={submit} className="auth-form">
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="switch">
        ¿Primera vez? <Link href="/register">Crear una cuenta</Link>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
