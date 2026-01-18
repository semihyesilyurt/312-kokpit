import { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    template: '%s | 312 Doner Kokpit',
    default: 'Giris | 312 Doner Kokpit',
  },
};

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
