'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="flex-1 space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kontrol Paneli</h1>
          <p className="text-muted-foreground">
            312 Doner yonetim sistemine hos geldiniz
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Bugunun Siparisleri"
          value="127"
          trend={{ value: 12, label: 'dunden bu yana', positive: true }}
        />
        <StatCard
          title="Aktif Kuryeler"
          value="8"
          description="12 kurye musait"
        />
        <StatCard
          title="Bugunun Cirosu"
          value="24,580 TL"
          trend={{ value: 8, label: 'dunden bu yana', positive: true }}
        />
        <StatCard
          title="Bekleyen Siparisler"
          value="14"
          description="Ortalama bekleme: 12 dk"
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Recent Orders */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Son Siparisler</CardTitle>
            <CardDescription>
              Son 10 siparisin ozeti
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Placeholder for orders list */}
              <div className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">#127</span>
                  </div>
                  <div>
                    <p className="font-medium">Ahmet Yilmaz</p>
                    <p className="text-sm text-muted-foreground">2x Doner Durum, 1x Ayran</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">85,00 TL</p>
                  <span className="status-badge status-badge-warning">Hazirlaniyor</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">#126</span>
                  </div>
                  <div>
                    <p className="font-medium">Mehmet Demir</p>
                    <p className="text-sm text-muted-foreground">1x Iskender, 2x Cola</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">145,00 TL</p>
                  <span className="status-badge status-badge-info">Yolda</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b last:border-0">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">#125</span>
                  </div>
                  <div>
                    <p className="font-medium">Ayse Kaya</p>
                    <p className="text-sm text-muted-foreground">3x Lahmacun, 1x Ayran</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">95,00 TL</p>
                  <span className="status-badge status-badge-success">Teslim Edildi</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Hizli Islemler</CardTitle>
            <CardDescription>
              Sik kullanilan islemler
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <button
                onClick={() => router.push('/dashboard/orders')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Yeni Siparis</p>
                  <p className="text-sm text-muted-foreground">Manuel siparis olustur</p>
                </div>
              </button>
              <button
                onClick={() => router.push('/dashboard/stock')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-success"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Stok Guncelle</p>
                  <p className="text-sm text-muted-foreground">Urun stoklarini duzenle</p>
                </div>
              </button>
              <button
                onClick={() => router.push('/dashboard/delivery')}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
              >
                <div className="h-10 w-10 rounded-full bg-info/10 flex items-center justify-center">
                  <svg
                    className="h-5 w-5 text-info"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium">Kurye Takibi</p>
                  <p className="text-sm text-muted-foreground">Canli harita gorunumu</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
