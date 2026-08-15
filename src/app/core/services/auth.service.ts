import { Injectable, computed, inject, signal } from '@angular/core';
import * as amplitude from '@amplitude/unified';
import type { Clerk } from '@clerk/clerk-js';
import { ClerkService } from './clerk.service';

export interface AuthUser {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly clerkService = inject(ClerkService);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _modalOpen = signal(false);
  private readonly _ready = signal(false);
  private readonly _loadError = signal<string | null>(null);
  private readonly _revokedNotice = signal<string | null>(null);
  private clerk: Clerk | null = null;
  private explicitSignOut = false;
  private lastVerifiedAt = 0;
  private readonly VERIFY_TTL_MS = 60_000;

  readonly user = this._user.asReadonly();
  readonly modalOpen = this._modalOpen.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly loadError = this._loadError.asReadonly();
  readonly revokedNotice = this._revokedNotice.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly currentUser = computed(() => this._user());

  constructor() {
    this.clerkService
      .load()
      .then((clerk) => {
        this.clerk = clerk;
        this.syncUser();
        clerk.addListener(() => this.syncUser());
        this._ready.set(true);
      })
      .catch((err) => {
        const message = clerkErrorMessage(err);
        console.error('Clerk failed to load:', err);
        this._loadError.set(message);
      });
  }

  requireAuth(): boolean {
    if (this.isAuthenticated()) return true;
    this._modalOpen.set(true);
    return false;
  }

  async requireAuthLive(): Promise<boolean> {
    if (!this.isAuthenticated()) {
      this._modalOpen.set(true);
      return false;
    }
    return this.verifySession();
  }

  async verifySession(options?: { force?: boolean }): Promise<boolean> {
    const clerk = this.clerk;
    const session = clerk?.session;
    if (!clerk || !session) return !this.isAuthenticated();
    if (!options?.force && Date.now() - this.lastVerifiedAt < this.VERIFY_TTL_MS) {
      return true;
    }
    try {
      const token = await session.getToken({ skipCache: true });
      if (!token) {
        await this.handleRevocation();
        return false;
      }
      this.lastVerifiedAt = Date.now();
      return true;
    } catch {
      await this.handleRevocation();
      return false;
    }
  }

  openModal(): void {
    this._modalOpen.set(true);
  }

  closeModal(): void {
    this._modalOpen.set(false);
    this._revokedNotice.set(null);
  }

  async logout(): Promise<void> {
    if (!this.clerk) return;
    this.explicitSignOut = true;
    this.lastVerifiedAt = 0;
    try {
      await this.clerk.signOut();
      amplitude.track('Signed Out');
      amplitude.setUserId(undefined);
    } finally {
      queueMicrotask(() => { this.explicitSignOut = false; });
    }
  }

  private async handleRevocation(): Promise<void> {
    this._revokedNotice.set('Your session was ended. Please sign in again.');
    this.explicitSignOut = true;
    this.lastVerifiedAt = 0;
    try {
      await this.clerk?.signOut();
      amplitude.setUserId(undefined);
    } catch {
      // ignore — server may already have revoked
    } finally {
      queueMicrotask(() => { this.explicitSignOut = false; });
    }
    this._modalOpen.set(true);
  }

  async loginWithPassword(email: string, password: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    try {
      const attempt = await clerk.client!.signIn.create({
        identifier: email.trim().toLowerCase(),
        password,
        strategy: 'password',
      });
      if (attempt.status === 'complete') {
        await clerk.setActive({ session: attempt.createdSessionId });
        this.trackSignIn('password');
        return { ok: true };
      }
      return { ok: false, error: 'Additional verification required to complete sign-in.' };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async startPhoneLogin(phone: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    try {
      await clerk.client!.signIn.create({
        strategy: 'phone_code',
        identifier: normalizePhone(phone),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async verifyPhoneCode(code: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    const signIn = clerk.client?.signIn;
    if (!signIn) return { ok: false, error: 'Phone login was not started. Please request a new code.' };
    try {
      const attempt = await signIn.attemptFirstFactor({ strategy: 'phone_code', code });
      if (attempt.status === 'complete') {
        await clerk.setActive({ session: attempt.createdSessionId });
        this.trackSignIn('phone');
        return { ok: true };
      }
      return { ok: false, error: 'Verification incomplete.' };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async loginWithGoogle(): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    try {
      const returnUrl = window.location.origin + window.location.pathname;
      await clerk.client!.signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: returnUrl,
        redirectUrlComplete: returnUrl,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async register(input: {
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    password: string;
  }): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    try {
      await clerk.client!.signUp.create({
        emailAddress: input.email.trim().toLowerCase(),
        password: input.password,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phoneNumber: input.phone ? normalizePhone(input.phone) : undefined,
      });
      await clerk.client!.signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async verifySignupEmail(code: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    const signUp = clerk.client?.signUp;
    if (!signUp) return { ok: false, error: 'No signup in progress. Please start over.' };
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === 'complete') {
        await clerk.setActive({ session: attempt.createdSessionId });
        amplitude.track('Signed Up', { provider: 'password' });
        this.trackSignIn('password');
        return { ok: true };
      }
      return { ok: false, error: 'Verification incomplete.' };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async startForgotPassword(email: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    try {
      await clerk.client!.signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim().toLowerCase(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async resetPassword(code: string, newPassword: string): Promise<AuthResult> {
    const clerk = this.clerk;
    if (!clerk) return this.notReadyResult();
    const signIn = clerk.client?.signIn;
    if (!signIn) return { ok: false, error: 'No password reset in progress. Please start over.' };
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });
      if (attempt.status === 'complete') {
        await clerk.setActive({ session: attempt.createdSessionId });
        this.trackSignIn('password');
        return { ok: true };
      }
      return { ok: false, error: 'Password reset incomplete.' };
    } catch (err) {
      return { ok: false, error: clerkErrorMessage(err) };
    }
  }

  async getToken(template?: string): Promise<string | null> {
    const clerk = this.clerk ?? (await this.clerkService.load());
    this.clerk = clerk;
    const session = clerk.session;
    if (!session) return null;
    return session.getToken(template ? { template } : undefined);
  }

  async handleRedirectCallback(): Promise<void> {
    const clerk = this.clerk ?? (await this.clerkService.load());
    this.clerk = clerk;
    try {
      await clerk.handleRedirectCallback({});
      this.trackSignIn('google');
    } catch (err) {
      console.error('OAuth redirect callback failed', err);
    }
  }

  private notReadyResult(): AuthResult {
    const err = this._loadError();
    if (err) return { ok: false, error: `Clerk failed to load: ${err}` };
    return { ok: false, error: 'Auth is still loading. Try again in a moment.' };
  }

  private syncUser(): void {
    const u = this.clerk?.user;
    const wasAuthenticated = this._user() !== null;
    if (!u) {
      this._user.set(null);
      if (wasAuthenticated && !this.explicitSignOut) {
        this._revokedNotice.set('Your session was ended. Please sign in again.');
        this._modalOpen.set(true);
        amplitude.setUserId(undefined);
      }
      return;
    }
    this._user.set({
      email: u.primaryEmailAddress?.emailAddress ?? '',
      phone: u.primaryPhoneNumber?.phoneNumber ?? '',
      firstName: u.firstName ?? '',
      lastName: u.lastName ?? '',
    });
  }

  private trackSignIn(provider: string): void {
    const email = this.clerk?.user?.primaryEmailAddress?.emailAddress;
    if (email) amplitude.setUserId(email);
    amplitude.track('Signed In', { provider });
    this._revokedNotice.set(null);
    this.lastVerifiedAt = Date.now();
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function clerkErrorMessage(err: unknown): string {
  const anyErr = err as { errors?: Array<{ code?: string; message?: string; longMessage?: string }>; message?: string };
  const first = anyErr?.errors?.[0];
  if (first?.longMessage) return first.longMessage;
  if (first?.message) return first.message;
  if (anyErr?.message) return anyErr.message;
  return 'Something went wrong. Please try again.';
}
