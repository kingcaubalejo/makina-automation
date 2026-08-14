import { Injectable, computed, signal } from '@angular/core';
import * as amplitude from '@amplitude/unified';

export interface RegisteredUser {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  password: string;
  provider: 'password' | 'google' | 'phone';
}

export interface AuthSession {
  token: string;
  user: Omit<RegisteredUser, 'password'>;
}

const USERS_KEY = 'automata_studio__users';
const SESSION_KEY = 'automata_studio__session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<AuthSession | null>(loadSession());
  private readonly _modalOpen = signal(false);

  readonly session = this._session.asReadonly();
  readonly modalOpen = this._modalOpen.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly currentUser = computed(() => this._session()?.user ?? null);

  requireAuth(): boolean {
    if (this.isAuthenticated()) return true;
    this._modalOpen.set(true);
    return false;
  }

  openModal(): void {
    this._modalOpen.set(true);
  }

  closeModal(): void {
    this._modalOpen.set(false);
  }

  logout(): void {
    this._session.set(null);
    localStorage.removeItem(SESSION_KEY);
    amplitude.track('Signed Out');
    amplitude.setUserId(undefined);
  }

  register(input: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    password: string;
  }): { ok: true } | { ok: false; error: string } {
    const users = loadUsers();
    const email = input.email.trim().toLowerCase();
    const phone = normalizePhone(input.phone);

    if (users.some((u) => u.email === email)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }
    if (users.some((u) => u.phone === phone)) {
      return { ok: false, error: 'An account with this phone number already exists.' };
    }

    const user: RegisteredUser = {
      email,
      phone,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      password: input.password,
      provider: 'password',
    };
    users.push(user);
    saveUsers(users);
    this.startSession(user);
    amplitude.track('Signed Up', { provider: user.provider });
    return { ok: true };
  }

  loginWithPassword(email: string, password: string): { ok: true } | { ok: false; error: string } {
    const users = loadUsers();
    const normalized = email.trim().toLowerCase();
    const user = users.find((u) => u.email === normalized);
    if (!user || user.password !== password) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    this.startSession(user);
    return { ok: true };
  }

  loginWithPhone(phone: string, code: string): { ok: true } | { ok: false; error: string } {
    if (code !== '000000') {
      return { ok: false, error: 'Invalid verification code. Hint: 000000 for mock.' };
    }
    const users = loadUsers();
    const normalized = normalizePhone(phone);
    let user = users.find((u) => u.phone === normalized);
    if (!user) {
      user = {
        email: `${normalized}@phone.local`,
        phone: normalized,
        firstName: 'Phone',
        lastName: 'User',
        password: '',
        provider: 'phone',
      };
      users.push(user);
      saveUsers(users);
    }
    this.startSession(user);
    return { ok: true };
  }

  loginWithGoogle(): { ok: true } | { ok: false; error: string } {
    const mockEmail = 'mock.google.user@gmail.com';
    const users = loadUsers();
    let user = users.find((u) => u.email === mockEmail);
    if (!user) {
      user = {
        email: mockEmail,
        phone: '',
        firstName: 'Google',
        lastName: 'User',
        password: '',
        provider: 'google',
      };
      users.push(user);
      saveUsers(users);
    }
    this.startSession(user);
    return { ok: true };
  }

  private startSession(user: RegisteredUser): void {
    const session: AuthSession = {
      token: mockJwt(user),
      user: {
        email: user.email,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        provider: user.provider,
      },
    };
    this._session.set(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this._modalOpen.set(false);
    amplitude.setUserId(user.email);
    amplitude.track('Signed In', { provider: user.provider });
  }
}

function loadUsers(): RegisteredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as RegisteredUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: RegisteredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
  } catch {
    return null;
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function mockJwt(user: RegisteredUser): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: user.email,
      email: user.email,
      phone: user.phone,
      name: `${user.firstName} ${user.lastName}`.trim(),
      provider: user.provider,
      iat: Math.floor(Date.now() / 1000),
    }),
  );
  return `${header}.${payload}.mock-signature`;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
