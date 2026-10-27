import type { SessionRecord } from '../auth/session.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  /** Cifrado con SecretBox. Existe desde el setup; cuenta recién con `totpEnabledAt`. */
  totpSecretSealed: string | null;
  totpEnabledAt: Date | null;
  /** Último paso TOTP aceptado: un código no sirve dos veces. */
  totpLastStep: number | null;
  createdAt: Date;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  get(id: string): Promise<UserRecord>;
  create(input: { email: string; passwordHash: string }): Promise<UserRecord>;
  update(id: string, patch: Partial<Omit<UserRecord, 'id' | 'createdAt'>>): Promise<void>;
  count(): Promise<number>;
  /**
   * Atómico: guarda `step` como último paso TOTP sólo si es posterior al guardado.
   * Dos pedidos en paralelo con el mismo código: uno solo devuelve true.
   */
  claimTotpStep(id: string, step: number): Promise<boolean>;
}

export interface SessionRepository {
  create(s: Omit<SessionRecord, 'id'>): Promise<SessionRecord>;
  findByTokenHash(hash: string): Promise<SessionRecord | null>;
  get(id: string): Promise<SessionRecord | null>;
  update(id: string, patch: Partial<Pick<SessionRecord, 'lastSeenAt' | 'expiresAt' | 'revokedAt'>>): Promise<void>;
  listActive(userId: string, now: Date): Promise<SessionRecord[]>;
  revokeAll(userId: string, at: Date, exceptId?: string): Promise<void>;
}

export interface RecoveryCodeRepository {
  replaceAll(userId: string, hashes: string[]): Promise<void>;
  /** Atómico: marca el código como usado sólo si existía y no estaba usado. */
  consume(userId: string, hash: string, at: Date): Promise<boolean>;
  deleteAll(userId: string): Promise<void>;
  countUnused(userId: string): Promise<number>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface RateLimit {
  key: string;
  limit: number;
}

export interface RateLimiter {
  /**
   * Reserva un intento en cada clave ANTES de verificar (atómico): una ráfaga en
   * paralelo no prueba más que el límite. Devuelve segundos de espera si alguna
   * clave lo pasó; null si el intento está permitido.
   */
  consume(limits: RateLimit[]): Promise<number | null>;
  /** Sólo mira: segundos de espera si alguna clave ya llegó a su límite. */
  blockedFor(limits: RateLimit[]): Promise<number | null>;
  reset(key: string): Promise<void>;
}

export type AuthEventType =
  | 'registered'
  | 'login_succeeded'
  | 'login_failed'
  | 'mfa_failed'
  | 'recovery_code_used'
  | 'logout'
  | 'logout_all'
  | 'session_revoked'
  | 'password_changed'
  | 'totp_enabled'
  | 'totp_disabled';

export interface AuthEvent {
  userId: string | null;
  type: AuthEventType;
  ip: string | null;
  userAgent: string | null;
  at: Date;
}

export interface AuthEventLog {
  record(e: AuthEvent): Promise<void>;
  listForUser(userId: string, limit: number): Promise<AuthEvent[]>;
}

/** Desde dónde llega el pedido: va a la sesión y al registro de eventos. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
}
