'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  const { signUp, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (user) {
    router.push('/');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email || !password || !confirmPassword) {
      setErrorMsg('Please fill in all fields.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUp(email, password);
      if (error) {
        setErrorMsg(error.message || 'Failed to sign up.');
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
      } else {
        setSuccessMsg('Account created successfully! Check your email for verification, or sign in now.');
        setTimeout(() => {
          router.push('/login');
        }, 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
      setHasError(true);
      setTimeout(() => setHasError(false), 500);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', display: 'flex' }}>
      {/* ─── Left Panel — Brand Showcase (hidden on mobile) ─── */}
      <div
        className="hidden lg:flex"
        style={{ width: '45%', minHeight: '100vh', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '10%', left: '15%',
              width: '350px', height: '350px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
          <div
            className="absolute animate-float-reverse animate-morph"
            style={{
              bottom: '15%', right: '10%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
              filter: 'blur(60px)',
              animationDelay: '3s',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(rgba(139, 92, 246, 0.025) 1px, transparent 1px),
                linear-gradient(90deg, rgba(139, 92, 246, 0.025) 1px, transparent 1px)
              `,
              backgroundSize: '48px 48px',
            }}
          />
        </div>

        <div className="relative" style={{ zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, padding: '0 48px' }}>
          <div className="animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-8 animate-pulse-glow"
              style={{ background: 'var(--gradient-brand)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}
            >
              🧠
            </div>
          </div>

          <h2
            className="text-4xl xl:text-5xl font-extrabold text-white leading-tight animate-fade-in-up"
            style={{ animationDelay: '0.2s' }}
          >
            Join the
            <br />
            <span className="gradient-text">smart investors</span>
          </h2>

          <p
            className="mt-5 text-base leading-relaxed animate-fade-in-up"
            style={{ color: 'var(--text-secondary)', maxWidth: '420px', animationDelay: '0.3s' }}
          >
            Create your free account to save watchlists, get personalized alerts, and access AI-powered market insights.
          </p>

          <div className="flex flex-wrap gap-2.5 mt-8 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            {['Free Forever', 'Cloud Sync', 'AI Insights', 'Custom Watchlists'].map((feature) => (
              <span
                key={feature}
                className="px-3.5 py-2 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.15)',
                  color: 'var(--accent-purple)',
                }}
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <div className="relative animate-fade-in" style={{ zIndex: 10, padding: '0 48px', paddingBottom: '32px', animationDelay: '0.6s' }}>
          <p className="text-xs" style={{ color: 'var(--text-disabled)' }}>
            © {new Date().getFullYear()} MarketPulse AI · Indian Stock Market Intelligence
          </p>
        </div>
      </div>

      {/* ─── Right Panel — Signup Form ─── */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', position: 'relative', background: 'rgba(10, 14, 26, 0.5)' }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none lg:hidden">
          <div
            className="absolute animate-float animate-morph"
            style={{
              top: '-10%', right: '-10%',
              width: '300px', height: '300px',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
          />
        </div>

        <div style={{ width: '100%', maxWidth: '448px', position: 'relative', zIndex: 10 }}>
          {/* Mobile brand header */}
          <div className="text-center mb-10 lg:hidden animate-fade-in-up">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-5 animate-pulse-glow"
              style={{ background: 'var(--gradient-brand)', boxShadow: '0 8px 32px rgba(59, 130, 246, 0.3)' }}
            >
              🧠
            </div>
            <h1 className="text-2xl font-bold gradient-text">MarketPulse AI</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Create your free account</p>
          </div>

          {/* Desktop form header */}
          <div className="hidden lg:block mb-10 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <h2 className="text-3xl font-bold text-white">Create Account</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Join to track and sync your stock watchlists
            </p>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className={`glass-card-static rounded-2xl p-7 sm:p-8 animate-fade-in-up ${hasError ? 'animate-shake' : ''}`}
            style={{
              animationDelay: '0.2s',
              border: errorMsg
                ? '1px solid rgba(244, 63, 94, 0.3)'
                : '1px solid var(--border-color)',
              transition: 'border-color 0.3s ease',
            }}
          >
            {errorMsg && (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 animate-fade-in-up"
                style={{ background: 'var(--accent-red-dim)', border: '1px solid rgba(244, 63, 94, 0.15)' }}
              >
                <AlertCircle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                <p className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>{errorMsg}</p>
              </div>
            )}

            {successMsg && (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3 mb-6 animate-fade-in-up"
                style={{ background: 'var(--accent-green-dim)', border: '1px solid rgba(16, 185, 129, 0.15)' }}
              >
                <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                <p className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>{successMsg}</p>
              </div>
            )}

            <div className="flex flex-col gap-4">
              {/* Email */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '16px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  Password (min 6 chars)
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '48px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', transition: 'color 0.25s ease' }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>
                  Confirm Password
                </label>
                <div style={{ position: 'relative' }}>
                  <ShieldCheck size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                  <input
                    id="signup-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={{
                      width: '100%',
                      borderRadius: '12px',
                      paddingLeft: '48px',
                      paddingRight: '16px',
                      paddingTop: '14px',
                      paddingBottom: '14px',
                      fontSize: '14px',
                      color: 'white',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    placeholder="••••••••"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <button
              id="signup-submit"
              type="submit"
              disabled={loading}
              className="btn-shine"
              style={{
                width: '100%',
                marginTop: '28px',
                color: 'white',
                fontWeight: 600,
                paddingTop: '14px',
                paddingBottom: '14px',
                borderRadius: '12px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1,
                transition: 'all 0.3s ease',
                fontSize: '14px',
                background: loading ? 'rgba(59, 130, 246, 0.6)' : 'var(--gradient-brand)',
                boxShadow: loading ? 'none' : '0 4px 20px rgba(59, 130, 246, 0.25)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2.5">
                  <span className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.25)', borderTopColor: 'white' }} />
                  Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link href="/login" className="font-bold hover:underline" style={{ color: 'var(--accent-blue)' }}>
              Sign In
            </Link>
          </p>

          <p className="text-center text-xs mt-4 lg:hidden" style={{ color: 'var(--text-disabled)' }}>
            © {new Date().getFullYear()} MarketPulse AI
          </p>
        </div>
      </div>
    </div>
  );
}
