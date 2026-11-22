# Warung Copilot

Dashboard manajemen toko berbasis AI. Admin dapat mengelola produk, mencatat transaksi penjualan, dan melihat ringkasan toko menggunakan bahasa natural melalui asisten chat.

## Daftar Isi

- [Fitur](#fitur)
- [Tech Stack](#tech-stack)
- [Memulai](#memulai)
- [Contoh Penggunaan](#contoh-penggunaan)
- [Arsitektur](#arsitektur)
- [Struktur Proyek](#struktur-proyek)
- [Daftar Tool](#daftar-tool)
- [Konfigurasi](#konfigurasi)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Kontribusi](#kontribusi)
- [Roadmap](#roadmap)
- [Lisensi](#lisensi)

## Fitur

- **Asisten AI** untuk menjalankan operasi toko lewat percakapan.
- **Manajemen produk**: tambah, ubah, hapus, cari, dan restok produk.
- **Point of Sale**: pencatatan penjualan, perhitungan total dan kembalian, serta pengurangan stok otomatis.
- **Analisis toko**: total produk, total stok, valuasi aset, daftar stok kritis, dan produk termahal.
- **Pembaruan data otomatis**: tabel produk di-refresh secara berkala tanpa reload halaman.
- **Deteksi pola**: query sederhana diproses langsung tanpa memanggil model, sehingga menghemat token dan kuota.
- **Normalisasi input**: format angka seperti `10k`, `15rb`, dan `1jt` dikonversi otomatis.

## Tech Stack

| Kategori | Teknologi |
|----------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Bahasa | TypeScript 5 |
| Styling | Tailwind CSS 4 |
| Database | Supabase (PostgreSQL) |
| Model AI | Groq — `openai/gpt-oss-20b` |
| State management | TanStack Query |
| Streaming | Vercel AI SDK |
| Ikon | Lucide |

## Memulai

### Prasyarat

- Node.js 18 atau lebih baru, atau Bun
- pnpm, npm, atau yarn
- Akun [Groq](https://console.groq.com/) dan API key
- Proyek [Supabase](https://supabase.com/)

### Instalasi

1. Clone repository dan masuk ke direktorinya.

   ```bash
   git clone https://github.com/yourusername/warung-copilot.git
   cd warung-copilot
   ```

2. Install dependensi.

   ```bash
   pnpm install
   ```

3. Salin file environment dan isi nilainya.

   ```bash
   cp .env.example .env.local
   ```

   ```env
   GROQ_API_KEY=
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   ```

4. Buat tabel di Supabase SQL Editor.

   ```sql
   create table products (
     id bigserial primary key,
     name text not null,
     price numeric not null,
     stock integer not null default 0,
     description text,
     created_at timestamp with time zone default now()
   );

   -- Hanya untuk pengembangan. Lihat catatan di bawah.
   alter table products disable row level security;
   ```

   > **Catatan keamanan:** Dengan RLS dinonaktifkan, siapa pun yang memiliki anon key dapat membaca dan mengubah data. Konfigurasi ini hanya untuk pengembangan. Aktifkan RLS dan definisikan policy sebelum digunakan di production.

5. Jalankan development server.

   ```bash
   pnpm dev
   ```

   Aplikasi tersedia di [http://localhost:3000](http://localhost:3000).

## Contoh Penggunaan

**Menambah produk**

```text
User: tambah produk Indomie Goreng harga 3500 stok 100
AI:   Produk "Indomie Goreng" berhasil ditambahkan (Rp 3.500, stok: 100).
```

**Mencatat penjualan**

```text
User: beli 3 Indomie Goreng bayar 20000
AI:   Transaksi berhasil.
      Total     : Rp 10.500
      Bayar     : Rp 20.000
      Kembalian : Rp 9.500
      Stok Indomie Goreng: 100 → 97
```

**Melihat data produk**

```text
User: apa data no 1
AI:   Data produk No. 1:
      Nama      : Indomie Goreng
      Harga     : Rp 3.500
      Stok      : 97 unit
      Deskripsi : Mie instan rasa goreng
```

**Analisis toko**

```text
User: analisis toko
AI:   Total produk     : 15 item
      Total stok       : 847 unit
      Valuasi aset     : Rp 2.450.000
      Stok kritis      : 3 item
      Produk termahal  : Aqua Galon (Rp 20.000)
```

## Arsitektur

Setiap pesan dari pengguna melewati lima tahap pemrosesan:

```text
Input pengguna
      │
      ▼
1. Pre-processing       Mendeteksi pola query sederhana dan menjawabnya
      │                 langsung tanpa memanggil model.
      ▼
2. System prompt        Menyusun prompt dinamis berisi konteks 10 produk
      │                 terbaru dan contoh percakapan (few-shot).
      ▼
3. Model (Groq)         Memilih dan memanggil tool yang sesuai.
      │
      ▼
4. Validasi             Memeriksa hasil. Jika tidak sesuai, permintaan
      │                 diulang.
      ▼
5. Format & streaming   Hasil dikirim ke antarmuka secara streaming.
```

Beberapa keputusan desain:

- **Konteks terbatas.** Hanya 5 pesan terakhir yang dikirim ke model untuk menghemat token.
- **Temperature 0,1** untuk menjaga konsistensi pemilihan tool.
- **Retry dengan exponential backoff** ketika menerima error 429 (rate limit).
- **Fallback** ke pre-processing saat model tidak tersedia.
- **Logging** keputusan AI untuk keperluan debugging.

## Struktur Proyek

```text
warung-copilot/
├── app/
│   ├── api/
│   │   ├── chat/route.ts        # Handler chat AI dan definisi tool
│   │   └── products/route.ts    # API CRUD produk
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Dashboard utama (split-screen)
├── components/
│   ├── ChatInterface.tsx        # Antarmuka chat dengan streaming
│   ├── ProductTable.tsx         # Tabel produk
│   └── ui/                      # Komponen UI umum
├── lib/
│   ├── supabase.ts              # Supabase client
│   └── utils.ts                 # Fungsi utilitas
├── AI_IMPROVEMENTS.md           # Catatan desain dan peningkatan AI
└── README.md
```

## Daftar Tool

| Tool | Fungsi |
|------|--------|
| `getProductByNumber` | Mengambil produk berdasarkan nomor urut |
| `getProducts` | Mengambil seluruh produk |
| `createProduct` | Menambah produk baru |
| `updateProduct` | Mengubah nama, harga, stok, atau deskripsi produk |
| `deleteProduct` | Menghapus satu produk atau seluruh produk |
| `addStock` | Menambah stok (barang masuk) |
| `recordSale` | Mencatat penjualan dan mengurangi stok |
| `searchProducts` | Mencari dan memfilter produk |
| `getStoreAnalytics` | Menghitung ringkasan dan analisis toko |

## Konfigurasi

### Environment variables

| Variabel | Keterangan |
|----------|------------|
| `GROQ_API_KEY` | API key Groq |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key Supabase |

### Batas penggunaan Groq (free tier)

| Parameter | Batas |
|-----------|-------|
| Tokens per menit (TPM) | 8.000 |
| Requests per menit (RPM) | 30 |
| Tokens per hari (TPD) | 200.000 |

Batas ini dapat berubah. Periksa nilai terbaru di [dokumentasi Groq](https://console.groq.com/docs/rate-limits).

## Deployment

Proyek ini dapat dideploy ke Vercel:

1. Push repository ke GitHub.
2. Import proyek di [Vercel](https://vercel.com).
3. Tambahkan ketiga environment variable pada pengaturan proyek.
4. Deploy.

## Troubleshooting

**Model tidak ditemukan atau sudah dihentikan (decommissioned)**
Pastikan model yang digunakan adalah `openai/gpt-oss-20b`. Daftar model yang tersedia ada di [dokumentasi Groq](https://console.groq.com/docs/models).

**Error 429 (rate limit)**
Retry otomatis sudah tersedia. Jika error berlanjut, kuota harian (TPD) kemungkinan telah habis.

**Respons AI tidak sesuai harapan**
Periksa logika pre-processing dan validasi di `app/api/chat/route.ts`, lalu lihat log konsol untuk melihat keputusan yang diambil.

**Tabel produk tidak diperbarui**
Data diambil ulang secara berkala oleh TanStack Query (interval 3 detik). Periksa tab Network pada browser untuk melihat error dari `/api/products`.

## Kontribusi

1. Fork repository.
2. Buat branch fitur: `git checkout -b feature/nama-fitur`
3. Commit perubahan: `git commit -m "Tambah nama-fitur"`
4. Push ke branch: `git push origin feature/nama-fitur`
5. Buka Pull Request.

## Roadmap

- [ ] Caching untuk query produk
- [ ] Dukungan multi-bahasa (ID/EN)
- [ ] Ekspor data ke CSV/Excel
- [ ] Grafik penjualan dan tren
- [ ] Optimasi tampilan mobile
- [ ] Dark mode
- [ ] Autentikasi pengguna dan dukungan multi-toko
- [ ] Integrasi barcode scanner

## Lisensi

Didistribusikan di bawah [MIT License](./LICENSE).
