'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useGuestOnly } from '@/hooks/useAuth';

// Validation schema
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-posta adresi gerekli')
    .email('Gecerli bir e-posta adresi girin'),
  password: z
    .string()
    .min(1, 'Sifre gerekli')
    .min(6, 'Sifre en az 6 karakter olmali'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading, error, clearError } = useGuestOnly();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    clearError();
    try {
      await login(data);
    } catch {
      // Error is handled by the store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative">
        <CardHeader className="space-y-4 text-center">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
              <span className="text-3xl font-bold text-primary-foreground">3</span>
            </div>
          </div>

          <div>
            <CardTitle className="text-2xl font-bold">312 Doner Kokpit</CardTitle>
            <CardDescription className="mt-2">
              Yonetim paneline erisim icin giris yapin
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Error Alert */}
            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email Field */}
            <div>
              <Input
                {...register('email')}
                type="email"
                label="E-posta Adresi"
                placeholder="ornek@312doner.com"
                autoComplete="email"
                error={!!errors.email}
                errorMessage={errors.email?.message}
                startIcon={<Mail className="h-4 w-4" />}
                disabled={isLoading}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
            </div>

            {/* Password Field */}
            <div>
              <Input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                label="Sifre"
                placeholder="Sifrenizi girin"
                autoComplete="current-password"
                error={!!errors.password}
                errorMessage={errors.password?.message}
                startIcon={<Lock className="h-4 w-4" />}
                endIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="hover:text-foreground transition-colors"
                    aria-label={showPassword ? 'Sifreyi gizle' : 'Sifreyi goster'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                disabled={isLoading}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
            </div>

            {/* Forgot Password Link */}
            <div className="flex justify-end">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => alert('Sifre sifirlama islemi icin yoneticinizle iletisime gecin.')}
              >
                Sifremi Unuttum
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={isLoading}
              disabled={isLoading}
            >
              Giris Yap
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Henuz hesabiniz yok mu?{' '}
              <span className="text-primary font-medium">
                Yonetici ile iletisime gecin
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Version info */}
      <div className="absolute bottom-4 left-0 right-0 text-center">
        <p className="text-xs text-muted-foreground">
          312 Doner Kokpit v1.0.0
        </p>
      </div>
    </div>
  );
}
