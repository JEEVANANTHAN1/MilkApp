import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentYear = new Date().getFullYear();
  protected mode = signal<'login' | 'register'>('login');
  protected mobileNumber = signal('');
  protected password = signal('');
  protected confirmPassword = signal('');
  protected showPassword = signal(false);
  protected submitting = signal(false);
  protected successMessage = signal<string | null>(null);
  protected localError = signal<string | null>(null);

  protected readonly errorMessage = computed(() => this.localError() || this.auth.error());

  protected get isLogin() { return this.mode() === 'login'; }
  protected get isRegister() { return this.mode() === 'register'; }

  protected switchMode(mode: 'login' | 'register') {
    this.mode.set(mode);
    this.auth.clearError();
    this.localError.set(null);
    this.successMessage.set(null);
    this.password.set('');
    this.confirmPassword.set('');
  }

  protected togglePassword() {
    this.showPassword.update(v => !v);
  }

  protected loginWithGoogle() {
    this.auth.loginWithGoogle();
  }

  protected onMobileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    // Only allow digits, spaces, +, hyphens
    const cleaned = input.value.replace(/[^0-9+\-\s]/g, '');
    this.mobileNumber.set(cleaned);
    input.value = cleaned;
  }

  protected async submit() {
    if (this.submitting()) return;

    const mobile = this.mobileNumber().trim();
    const pass = this.password();

    if (!mobile) { this.localError.set('Please enter your mobile number.'); return; }
    if (!pass) { this.localError.set('Please enter your password.'); return; }

    if (this.isRegister) {
      if (pass.length < 6) { this.localError.set('Password must be at least 6 characters.'); return; }
      if (pass !== this.confirmPassword()) { this.localError.set('Passwords do not match.'); return; }
    }

    this.submitting.set(true);
    this.localError.set(null);
    this.auth.clearError();

    try {
      if (this.isLogin) {
        await this.auth.login(mobile, pass);
        this.router.navigate(['/']);
      } else {
        await this.auth.register(mobile, pass);
        // If register returned a user (auto-login), navigate away; else show success + switch to login
        if (this.auth.isAuthenticated()) {
          this.router.navigate(['/']);
        } else {
          this.successMessage.set('Account created! Please log in.');
          this.switchMode('login');
        }
      }
    } catch {
      // Error is already set in the service
    } finally {
      this.submitting.set(false);
    }
  }
}
