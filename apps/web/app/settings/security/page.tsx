'use client';

import QRCode from 'qrcode';
import { useCallback, useState } from 'react';
import { auth, type AuthEventView, type Me, type SessionView } from '@/lib/api';
import { useLoad } from '@/lib/use-load';

const EVENT_LABELS: Record<string, string> = {
  registered: 'Creaste la cuenta',
  login_succeeded: 'Entraste',
  login_failed: 'Intento de entrada fallido',
  mfa_failed: 'Código de verificación incorrecto',
  recovery_code_used: 'Usaste un código de recuperación',
  logout: 'Saliste',
  logout_all: 'Cerraste todas las sesiones',
  session_revoked: 'Cerraste una sesión',
  password_changed: 'Cambiaste la contraseña',
  totp_enabled: 'Activaste la verificación en dos pasos',
  totp_disabled: 'Desactivaste la verificación en dos pasos',
};

const when = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });

/** "Chrome en Windows" alcanza para reconocer un dispositivo; el user agent entero no lo lee nadie. */
function device(ua: string | null): string {
  if (!ua) return 'Dispositivo desconocido';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : ua.includes('curl') ? 'curl' : 'Navegador';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} en ${os}` : browser;
}

function TwoFactor({ me, onChange }: { me: Me; onChange: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    const { secret, uri } = await auth.totpSetup();
    setSetup({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 192 }) });
  };
  const enable = () =>
    auth
      .totpEnable(code)
      .then(({ recoveryCodes }) => {
        setCodes(recoveryCodes);
        setSetup(null);
        setCode('');
        onChange();
      })
      .catch((e: Error) => setError(e.message));
  const disable = () =>
    auth
      .totpDisable(password, code)
      .then(() => {
        setCode('');
        setPassword('');
        onChange();
      })
      .catch((e: Error) => setError(e.message));

  if (codes) {
    return (
      <div className="panel">
        <h3>Guardá estos códigos de recuperación</h3>
        <p>Si perdés el celular, cada uno te deja entrar una vez. No se vuelven a mostrar.</p>
        <ul className="codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="actions">
          <button onClick={() => navigator.clipboard.writeText(codes.join('\n'))}>Copiar</button>
          <button className="primary" onClick={() => setCodes(null)}>
            Ya los guardé
          </button>
        </div>
      </div>
    );
  }

  if (me.totpEnabled) {
    return (
      <div className="panel">
        <p>
          <span className="status">Activa</span> Te quedan {me.recoveryCodesLeft} códigos de recuperación.
        </p>
        <p className="muted">Para desactivarla, confirmá con tu contraseña y un código.</p>
        <div className="inline-form">
          <input type="password" placeholder="Contraseña" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <input placeholder="Código" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button onClick={disable} disabled={!password || !code}>
            Desactivar
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  if (setup) {
    return (
      <div className="panel totp-setup">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="Código QR para la app de autenticación" width={192} height={192} />
        <div>
          <p>Escaneá el código con Google Authenticator, Aegis, 1Password o la que uses. Si no podés escanear, cargá esta clave:</p>
          <p className="secret">{setup.secret.match(/.{1,4}/g)?.join(' ')}</p>
          <div className="inline-form">
            <input autoFocus placeholder="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="primary" onClick={enable} disabled={code.length !== 6}>
              Activar
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <p>Además de la contraseña, te va a pedir un código de tu celular. Si alguien consigue tu contraseña, no le alcanza.</p>
      <button className="primary" onClick={start}>
        Configurar
      </button>
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    auth
      .changePassword(current, next)
      .then(() => {
        setCurrent('');
        setNext('');
        setMessage({ ok: true, text: 'Contraseña cambiada. Cerramos las sesiones de tus otros dispositivos.' });
      })
      .catch((err: Error) => setMessage({ ok: false, text: err.message }));
  };

  return (
    <form className="panel inline-form" onSubmit={submit}>
      <input type="password" placeholder="Contraseña actual" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input type="password" placeholder="Nueva (12 caracteres o más)" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} />
      <button disabled={!current || next.length < 12}>Cambiar</button>
      {message && <p className={message.ok ? 'form-ok' : 'form-error'}>{message.text}</p>}
    </form>
  );
}

export default function SecurityPage() {
  const { data, error, reload } = useLoad(
    useCallback(async () => {
      const [me, sessions, events] = await Promise.all([auth.me(), auth.sessions(), auth.events()]);
      return { me, sessions, events };
    }, []),
  );

  if (error) return <p className="notice error">No se pudo cargar la configuración de seguridad ({error}).</p>;
  if (!data) return null;
  const { me, sessions, events } = data as { me: Me; sessions: SessionView[]; events: AuthEventView[] };
  const others = sessions.filter((s) => !s.current).length;

  return (
    <>
      <header className="page-head">
        <h1>Seguridad</h1>
        <p>Entrás como {me.email}.</p>
      </header>

      <section className="settings">
        <h2>Verificación en dos pasos</h2>
        <TwoFactor me={me} onChange={reload} />
      </section>

      <section className="settings">
        <h2>
          Dónde está abierta tu cuenta <span className="count">{sessions.length}</span>
        </h2>
        {sessions.map((s) => (
          <div key={s.id} className="doc">
            <div>
              <div className="name">
                {device(s.userAgent)} {s.current && <span className="status">Esta sesión</span>}
              </div>
              <div className="detail">
                Última actividad {when(s.lastSeenAt)}
                {s.ip ? ` desde ${s.ip}` : ''}
              </div>
            </div>
            {!s.current && (
              <button className="quiet" onClick={() => auth.revokeSession(s.id).then(reload)}>
                Cerrar
              </button>
            )}
          </div>
        ))}
        <div className="actions">
          <button onClick={() => auth.logoutAll().finally(() => window.location.assign('/login'))}>
            Cerrar todas, incluida esta{others > 0 ? ` (${others + 1})` : ''}
          </button>
        </div>
      </section>

      <section className="settings">
        <h2>Contraseña</h2>
        <ChangePassword />
      </section>

      <section className="settings">
        <h2>Actividad reciente</h2>
        {events.length === 0 && <p className="empty">Sin actividad todavía.</p>}
        {events.map((e, i) => (
          <div key={i} className={`event ${e.type.endsWith('failed') ? 'bad' : ''}`}>
            <span>{EVENT_LABELS[e.type] ?? e.type}</span>
            <span className="detail">
              {when(e.at)} · {device(e.userAgent)}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
