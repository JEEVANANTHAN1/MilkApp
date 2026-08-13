import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  userId: string;
  email?: string;
  mobileNumber?: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

const TOKEN_KEY = 'mf_access_token';
const REFRESH_KEY = 'mf_refresh_token';
const USER_KEY = 'mf_user';
const EXPIRY_KEY = 'mf_token_expiry';

function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  private readonly _user = signal<AuthUser | null>(this.loadStoredUser());
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly user = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._user() !== null && this.hasValidToken());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  constructor() {
    this.handleOAuthCallback();
    this.checkAndRestoreSession();
  }

  /** Initiates Google OAuth Login via Supabase Auth */
  loginWithGoogle(): void {
    const redirectTo = encodeURIComponent(`${window.location.origin}/login`);
    const googleAuthUrl = `${environment.supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
    window.location.href = googleAuthUrl;
  }

  async login(mobileNumber: string, password: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const tokens = await firstValueFrom(
        this.http.post<AuthTokens>(`${this.apiUrl}/login`, { mobileNumber, password })
      );
      const authUser: AuthUser = { userId: tokens.userId, mobileNumber };
      this.storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn, authUser);
      this._user.set(authUser);
    } catch (err: any) {
      const msg = err?.error?.message || 'Login failed. Please check your credentials.';
      this._error.set(msg);
      throw new Error(msg);
    } finally {
      this._loading.set(false);
    }
  }

  async register(mobileNumber: string, password: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const result = await firstValueFrom(
        this.http.post<AuthTokens | { message: string }>(`${this.apiUrl}/register`, { mobileNumber, password })
      );
      if ('accessToken' in result && result.accessToken) {
        const tokens = result as AuthTokens;
        const authUser: AuthUser = { userId: tokens.userId, mobileNumber };
        this.storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn, authUser);
        this._user.set(authUser);
      }
    } catch (err: any) {
      const msg = err?.error?.message || 'Registration failed. Mobile number may already be registered.';
      this._error.set(msg);
      throw new Error(msg);
    } finally {
      this._loading.set(false);
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    this._user.set(null);
    this._error.set(null);
    this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  clearError(): void {
    this._error.set(null);
  }

  /** Check URL hash for OAuth redirect tokens from Supabase */
  private handleOAuthCallback(): void {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;

    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';
    const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
    const errorDescription = params.get('error_description');

    if (errorDescription) {
      this._error.set(decodeURIComponent(errorDescription));
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    if (accessToken) {
      const payload = parseJwt(accessToken);
      if (payload && payload.sub) {
        const authUser: AuthUser = {
          userId: payload.sub,
          email: payload.email,
          name: payload.user_metadata?.full_name || payload.user_metadata?.name || payload.email,
          avatarUrl: payload.user_metadata?.avatar_url || payload.user_metadata?.picture,
        };

        this.storeTokens(accessToken, refreshToken, expiresIn, authUser);
        this._user.set(authUser);

        // Clear hash from URL and redirect to home
        window.history.replaceState(null, '', window.location.pathname);
        this.router.navigate(['/']);
      }
    }
  }

  private hasValidToken(): boolean {
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (!expiry) return false;
    return Date.now() < parseInt(expiry, 10);
  }

  private async checkAndRestoreSession(): Promise<void> {
    const token = localStorage.getItem(TOKEN_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    const user = this.loadStoredUser();

    if (!token || !user) {
      return;
    }

    if (!this.hasValidToken() && refresh) {
      try {
        const tokens = await firstValueFrom(
          this.http.post<AuthTokens>(`${this.apiUrl}/refresh`, { refreshToken: refresh })
        );
        this.storeTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn, user);
        this._user.set(user);
      } catch {
        this.logout();
      }
    }
  }

  private storeTokens(accessToken: string, refreshToken: string, expiresIn: number, user: AuthUser): void {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private loadStoredUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
