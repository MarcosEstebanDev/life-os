'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthCard } from '@/components/auth-card';
import { ApiError, auth } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';

function MfaForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.mfa(code);
      router.replace(next);
    } catch (err) {
      // La sesión pendiente se revoca tras 5 intentos o si venció: hay que volver a empezar.
      if (err instanceof ApiError && err.code === 'unauthenticated') {
        router.replace('/login');
        return;
      }
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Verificación en dos pasos"
      intro={recovery ? 'Escribí uno de los códigos de recuperación que guardaste. Cada uno sirve una sola vez.' : 'Escribí el código de 6 dígitos de tu app de autenticación.'}
    >
      <form onSubmit={submit} className="auth-form">
        <label>
          {recovery ? 'Código de recuperación' : 'Código'}
          <input
            key={recovery ? 'recovery' : 'totp'}
            autoFocus
            autoComplete="one-time-code"
            inputMode={recovery ? 'text' : 'numeric'}
            placeholder={recovery ? 'xxxx-xxxx-xxxx-xxxx' : '123456'}
            maxLength={recovery ? 19 : 6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={recovery ? '' : 'code-input'}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? 'Verificando…' : 'Verificar'}
        </button>
      </form>
      <p className="switch">
        <button
          className="link"
          onClick={() => {
            setRecovery(!recovery);
            setCode('');
            setError(null);
          }}
        >
          {recovery ? 'Usar el código de la app' : 'No tengo el celular: usar un código de recuperación'}
        </button>
      </p>
    </AuthCard>
  );
}

export default function MfaPage() {
  return (
    <Suspense>
      <MfaForm />
    </Suspense>
  );
}
