import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  userId: string;
  mobileNumber: string;
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
    // Try to restore session from localStorage on app start
    this.checkAndRestoreSession();
  }

  async login(mobileNumber: string, password: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const tokens = await firstValueFrom(
        this.http.post<AuthTokens>(`${this.apiUrl}/login`, { mobileNumber, password })
      );
      this.storeTokens(tokens, mobileNumber);
      this._user.set({ userId: tokens.userId, mobileNumber });
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
      // If we got an access token back, log in immediately
      if ('accessToken' in result && result.accessToken) {
        this.storeTokens(result as AuthTokens, mobileNumber);
        this._user.set({ userId: (result as AuthTokens).userId, mobileNumber });
      }
      // Otherwise, the server returned a message — user can now log in
    } catch (err: any) {
      const msg = err?.error?.message || 'Registration failed. This mobile number may already be registered.';
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
      this._user.set(null);
      return;
    }

    if (!this.hasValidToken() && refresh) {
      // Try to refresh the token
      try {
        const tokens = await firstValueFrom(
          this.http.post<AuthTokens>(`${this.apiUrl}/refresh`, { refreshToken: refresh })
        );
        this.storeTokens(tokens, user.mobileNumber);
        this._user.set({ userId: tokens.userId, mobileNumber: user.mobileNumber });
      } catch {
        // Refresh failed — clear session
        this.logout();
      }
    }
  }

  private storeTokens(tokens: AuthTokens, mobileNumber: string): void {
    localStorage.setItem(TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    localStorage.setItem(EXPIRY_KEY, String(Date.now() + tokens.expiresIn * 1000));
    localStorage.setItem(USER_KEY, JSON.stringify({ userId: tokens.userId, mobileNumber }));
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
