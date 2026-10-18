# PANDUAN DESIGN SYSTEM SWIMS-HBICS

Semua halaman WAJIB mengikuti panduan ini. Token warna & CSS class sudah ada di
`src/app/globals.css` — jangan tulis hex code langsung di JSX.

## 1. Struktur halaman

```tsx
<div className="space-y-6">
  <PageHeader
    title="Judul Halaman"
    description="Subtitle kecil abu kebiruan"
    actions={
      <Button><Plus className="size-4" /> Tambah</Button>
    }
  />

  {/* Baris kartu statistik */}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard ... />
  </div>

  {/* Konten */}
  <div className="grid gap-6 lg:grid-cols-3">
    <Card>...</Card>
  </div>
</div>
```

`space-y-6` untuk jarak antar seksi. Halaman **tidak** perlu padding sendiri —
sudah diatur oleh `app/dashboard/layout.tsx`.

## 2. Komponen yang tersedia (JANGAN buat ulang)

| Import | Path | Kapan dipakai |
|---|---|---|
| `PageHeader` | `@/components/ui/page-header` | Judul + subtitle + tombol aksi |
| `ActionLink` | `@/components/ui/page-header` | Link "Lihat semua →" |
| `EmptyState` | `@/components/ui/page-header` | Kondisi data kosong |
| `StatCard` | `@/components/ui/stat-card` | Angka statistik + tren + progress |
| `ProgressPill` | `@/components/ui/stat-card` | Progress bar pill |
| `IconBox` | `@/components/ui/icon-box` | Kotak ikon pastel |
| `StatusBadge` | `@/components/ui/status-badge` | Badge status + titik |
| `severityTone` | `@/components/ui/status-badge` | Map string severity → tone |
| `DataTable` + friends | `@/components/ui/data-table` | Tabel minimalis |
| `Card` family | `@/components/ui/card` | Kartu putih |
| `Button` | `@/components/ui/button` | `default`=primer, `outline`=sekunder |
| `Badge` | `@/components/ui/badge` | Badge pill |
| `Tabs` family | `@/components/ui/tabs` | Tab pill garis bawah |
| `Input`, `Textarea`, `Label`, `Select` | `@/components/ui/*` | Form |

## 3. Token yang boleh dipakai

```
bg-background     → canvas #F4F7FC
bg-card           → putih
text-heading      → navy #0F1B4C (judul)
text-muted-foreground → abu kebiruan #5B6B8C (teks sekunder, AA 4.5:1)
text-secondary-text   → abu kebiruan lebih gelap (isi paragraf)
border-border     → #E6EAF2
bg-primary        → biru #1E88F5 (link, aksen, fokus)
bg-primary-strong → biru #1570C7 (ISI tombol primer — teks putih AA 5.03:1)
text-primary      → biru
bg-primary-softer → biru sangat muda (hover row)
bg-primary-soft   → biru muda
success/warning/danger/info + varian *-soft → semantik
```

Utility CSS dari globals.css: `.page-title`, `.page-subtitle`, `.card-label`,
`.stat-value`, `.swims-table`, `.action-link`, `.scroll-slim`.

## 4. Aturan visual

- **Kartu**: `rounded-2xl` (16px), `border border-border`, `shadow-card`.
  Gunakan `<Card interactive>` bila kartu bisa diklik.
- **Tombol**: radius 10px. Primer `<Button>` (biru solid + shadow lembut),
  sekunder `<Button variant="outline">`.
- **Judul halaman**: selalu lewat `<PageHeader>`. Judul besar bold navy.
- **Angka statistik**: `StatCard` — angka `text-2xl` bold navy (atau lebih besar
  untuk hero), label kecil abu di atas, hint kecil di bawah.
SELALU `lucide-react` (outline). Ukuran ikon seragam.
  Bungkus dengan `<IconBox tone="blue|green|red|yellow|purple|teal|pink|slate">`.
- **Status**: `<StatusBadge tone="..." label="..." />`. Pakai `severityTone(x)`
  untuk nilai dari backend (LOW/MEDIUM/HIGH/CRITICAL/status kasus).
- **Tabel**: `<DataTable>` + `TableHead/TableBody/TableRow/TableHeaderCell/TableCell`.
  Status di cell pakai `StatusBadge`, bukan badge kustom.
- **Progress**: `<ProgressPill value={n} tone="blue" />`.
- **Teks**: `text-sm` untuk isi, `text-xs` untuk metadata. Jangan `text-base`
  untuk isi panjang.
- **Loading**: spinner `border-[3px] border-primary/20 border-t-primary`.
- **Kosong**: `<EmptyState icon={...} title="..." description="..." />`.

## 5. Larangan

- ❌ `dark:` variant — aplikasi sudah light mode.
- ❌ `.glass` untuk kartu baru (class itu sudah di-override jadi kartu putih,
  tapi lebih baik pakai `<Card>`).
- ❌ Hex color langsung (`#1E88F5`) di JSX — pakai token.
- ❌ Gradient berat, glassmorphism, neon, dark background.
- ❌ Emoji sebagai ikon (pakai lucide-react).
- ❌ `bg-destructive` untuk tombol biasa — hanya untuk hapus/batal.
- ❌ Padding manual di halaman — layout sudah menyediakan.

## 6. Bahasa

SELURUH teks UI harus **Bahasa Indonesia** yang ramah & singkat:
- "Kasus Siswa", "Laporan Insiden", "Siswa yang Dilaporkan", "Belum ada data"
- "Tambah", "Simpan", "Batal", "Hapus", "Lihat detail", "Selengkapnya"
- Bustah: "Anda belum memiliki data. Mulai dengan menambahkan laporan insiden."
- Jangan ada teks Inggris tersisa di UI (kecuali istilah baku: "PDF", "Excel", "ID").

## 7. Aksesibilitas

- Semua `IconButton` wajib punya `aria-label` Bahasa Indonesia.
- Tabel wajib punya `<th scope="col">`.
- Jangan hapus fokus keyboard — jangan pakai `outline-none` tanpa pasangan.
- Kontras teks: heading navy di atas putih, teks sekunder minimal `#5b6b8c`.

## 8. Before you finish

Jalankan `cd /home/ubuntu/SWIMS-HBICS/frontend && npx tsc --noEmit -p tsconfig.json`
dan pastikan tidak ada error TypeScript baru yang kamu sebabkan.