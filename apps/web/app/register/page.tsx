'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { auth } from '@/lib/api';

const MIN = 12;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.register(email, password);
      router.replace('/brief');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Crear una cuenta" intro="Después de entrar podés activar la verificación en dos pasos desde Seguridad.">
      <form onSubmit={submit} className="auth-form">
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-hint"
          />
          <span id="password-hint" className={`hint ${password.length >= MIN ? 'ok' : ''}`}>
            {password.length >= MIN ? 'Largo suficiente.' : `Al menos ${MIN} caracteres. Una frase es más fácil de recordar que símbolos raros.`}
          </span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={busy || password.length < MIN}>
          {busy ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="switch">
        ¿Ya tenés cuenta? <Link href="/login">Entrar</Link>
      </p>
    </AuthCard>
  );
}
