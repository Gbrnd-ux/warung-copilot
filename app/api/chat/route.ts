import { OpenAIStream, StreamingTextResponse, formatStreamPart } from 'ai';
import { supabase } from '@/lib/supabase';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-20b'; // Production model - Fast (1000 t/s), available di free tier, rate limit: 8K TPM / 30 RPM

// Auto retry dengan exponential backoff jika terkena rate limit (429) dari Groq
async function fetchWithRetry(url: string, options: any, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429 && attempt < maxRetries - 1) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter
        ? Math.ceil(parseFloat(retryAfter) * 1000) + 600
        : 1500 * (attempt + 1);
      console.warn(`[Groq RateLimit 429] Menunggu ${waitMs}ms sebelum retry (percobaan ${attempt + 1}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

// Build dynamic system message with current product context
async function buildSystemMessage() {
  const baseContent = `Anda adalah admin toko & asisten kasir cerdas untuk "Warung Copilot".
Bantu pemilik warung mengelola produk, kasir penjualan, dan laporan toko secara ringkas dan ramah.

PANDUAN UTAMA:
1. NOMOR URUT TABEL: Tabel produk di layar diurutkan dari produk terbaru (No. 1 paling atas). Jika pengguna menyebut "no 1", "nomor 2", dsb., gunakan angka tersebut ("1", "2") pada parameter productName / identifier.
2. NAMA vs DESKRIPSI: Nama produk HANYA nama merek/judul ringkas (misal: "Good Day Chocolatte"). Deskripsi adalah varian atau penjelasannya (misal: "kopi sachet rasa cokelat").
3. SLANG ANGKA: 10k/10rb = 10000, 15k = 15000, 1jt = 1000000.
4. KASIR: Jika pembeli belanja/beli barang, gunakan tool recordSale untuk hitung total, kembalian, dan potong stok.
5. RESTOK: Jika ada barang baru masuk / kulakan, gunakan tool addStock.

ATURAN WAJIB UNTUK KONSISTENSI:
- Ketika user menanyakan produk SPESIFIK (misal "apa data no 1", "data nomor 2", "produk 1"), WAJIB panggil tool getProductByNumber dengan nomor urut yang dimaksud
- JANGAN menjawab dari memori atau data lama - SELALU ambil data terbaru dari database via tool
- Setiap kali menjawab tentang produk tertentu, format jawaban harus KONSISTEN:
  * Nama: [nama produk]
  * Harga: Rp [harga]
  * Stok: [jumlah] unit
  * Deskripsi: [deskripsi]

CONTOH PERCAKAPAN YANG BENAR:

User: "apa data no 1"
AI Action: [WAJIB panggil getProductByNumber dengan number: 1]
AI Response: "Berikut data produk No. 1:
• Nama: Nasi Goreng
• Harga: Rp 25.000
• Stok: 50 unit
• Deskripsi: Nasi goreng pedas dengan telur

Ada yang bisa saya bantu lagi? 😊"

User: "apadata no 1"
AI Action: [WAJIB panggil getProductByNumber dengan number: 1]
AI Response: [FORMAT YANG SAMA seperti di atas]

User: "apa isi data no 1"
AI Action: [WAJIB panggil getProductByNumber dengan number: 1]
AI Response: [FORMAT YANG SAMA seperti di atas]

User: "data nomor 2"
AI Action: [WAJIB panggil getProductByNumber dengan number: 2]
AI Response: [FORMAT YANG SAMA dengan nomor produk yang berbeda]

PENTING: Untuk pertanyaan yang berbeda tentang produk yang sama, jawaban HARUS IDENTIK karena data diambil dari database yang sama!

Jawab selalu ramah, ringkas, dan format harga dalam Rupiah (contoh: Rp 10.000).`;

  try {
    // Ambil 10 produk teratas sebagai konteks
    const { data: products } = await supabase
      .from('products')
      .select('name, price, stock')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(10);

    if (products && products.length > 0) {
      const productSummary = products
        .map((p, i) => `  No.${i + 1}: ${p.name} - Rp ${p.price.toLocaleString('id-ID')} (stok: ${p.stock})`)
        .join('\n');

      return {
        role: 'system',
        content: `${baseContent}

PRODUK SAAT INI DI DATABASE (${products.length} produk teratas):
${productSummary}

Gunakan data di atas sebagai referensi cepat. Untuk data lengkap/update, WAJIB panggil tool getProductByNumber atau tool lainnya.`,
      };
    }
  } catch (err) {
    console.warn('Failed to load products for system context:', err);
  }

  // Fallback jika gagal load produk
  return {
    role: 'system',
    content: baseContent,
  };
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'getProductByNumber',
      description: 'WAJIB gunakan tool ini saat user menanyakan produk dengan nomor urut spesifik (misal: "apa data no 1", "produk nomor 2", "lihat item 3", "apa isi data no 1"). Tool ini mengembalikan detail lengkap 1 produk berdasarkan nomor urutnya.',
      parameters: {
        type: 'object',
        properties: {
          number: { 
            type: 'integer', 
            description: 'Nomor urut produk di tabel (1 = produk terbaru, 2 = produk kedua terbaru, dst)' 
          },
        },
        required: ['number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createProduct',
      description: 'Menambah 1 atau beberapa produk baru ke database warung',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nama ringkas produk (misal: "Good Day Chocolatte")' },
          price: { type: 'number', description: 'Harga dalam rupiah penuh (misal: 15000)' },
          stock: { type: 'integer', description: 'Jumlah stok' },
          description: { type: 'string', description: 'Deskripsi singkat / varian' },
        },
        required: ['name', 'price', 'stock'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updateProduct',
      description: 'Mengubah nama, deskripsi, harga, atau stok produk (bisa pakai nama atau nomor urut tabel misal "1")',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nama produk atau nomor urut di tabel (misal "1", "no 2", "Aqua")' },
          newName: { type: 'string', description: 'Nama baru jika ingin diubah' },
          newDescription: { type: 'string', description: 'Deskripsi baru jika ingin diubah' },
          newPrice: { type: 'number', description: 'Harga baru jika ingin diubah' },
          newStock: { type: 'integer', description: 'Stok baru jika ingin diubah' },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addStock',
      description: 'Menambah stok masuk/kulakan ke stok yang ada (bisa pakai nama atau nomor urut tabel)',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nama produk atau nomor urut di tabel (misal "1", "Indomie")' },
          additionalStock: { type: 'integer', description: 'Jumlah unit yang ditambahkan' },
        },
        required: ['identifier', 'additionalStock'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recordSale',
      description: 'Mencatat transaksi kasir: hitung total belanja, kembalian uang, dan potong stok otomatis',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productName: { type: 'string', description: 'Nama produk atau nomor urut di tabel' },
                quantity: { type: 'integer', description: 'Jumlah dibeli' },
              },
              required: ['productName', 'quantity'],
            },
          },
          paymentAmount: { type: 'number', description: 'Uang pembayaran pembeli' },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchProducts',
      description: 'Mencari & filter produk (berdasarkan kata kunci, rentang harga, atau stok menipis)',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Kata kunci pencarian' },
          maxPrice: { type: 'number', description: 'Batas harga maksimal' },
          minPrice: { type: 'number', description: 'Batas harga minimal' },
          lowStockOnly: { type: 'boolean', description: 'True untuk barang stok <= 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getStoreAnalytics',
      description: 'Menganalisis kondisi warung: total valuasi aset barang (Rp), total stok, produk termahal/termurah, barang kritis',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deleteProduct',
      description: 'Menghapus 1 produk (berdasarkan nama / no urut) atau SEMUA produk (jika deleteAll: true)',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nama produk atau nomor urut tabel yang ingin dihapus' },
          deleteAll: { type: 'boolean', description: 'Set true jika ingin menghapus seluruh produk (kosongkan tabel)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProducts',
      description: 'Melihat seluruh daftar produk di toko',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// Helper untuk mencocokkan produk secara deterministik baik via nomor urut tabel (1, 2, "no 1") maupun nama
async function resolveProduct(identifier: string) {
  const trimmed = (identifier || '').trim();

  // 1. Cek nomor urut (contoh: "1", "no 1", "nomor 2", "#3")
  const numMatch = trimmed.match(/^(?:no\.?|nomor|#)?\s*(\d+)$/i);
  if (numMatch) {
    const index = parseInt(numMatch[1], 10) - 1;
    const { data: allProducts, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (!error && allProducts && allProducts[index]) {
      return { product: allProducts[index], error: null };
    }
  }

  // 2. Cocokkan berdasarkan nama produk (substring)
  const { data: products, error: findError } = await supabase
    .from('products')
    .select('*')
    .ilike('name', `%${trimmed}%`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(1);

  if (findError) return { product: null, error: findError };
  if (!products || products.length === 0) {
    return { product: null, error: new Error(`Produk "${trimmed}" tidak ditemukan di database.`) };
  }

  return { product: products[0], error: null };
}

async function executeTool(name: string, args: any): Promise<any> {
  // 0. Get Product By Number (Query Spesifik)
  if (name === 'getProductByNumber') {
    try {
      const number = parseInt(args.number);
      
      if (isNaN(number) || number < 1) {
        return { success: false, message: 'Nomor produk harus angka positif (1, 2, 3, ...)' };
      }

      const { data: allProducts, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

      if (error) throw error;

      if (!allProducts || allProducts.length === 0) {
        return { success: false, message: 'Belum ada produk di database.' };
      }

      const index = number - 1;
      if (index >= allProducts.length) {
        return { 
          success: false, 
          message: `Produk No. ${number} tidak ditemukan. Database hanya memiliki ${allProducts.length} produk.` 
        };
      }

      const product = allProducts[index];
      
      return {
        success: true,
        product: {
          number: number,
          id: product.id,
          name: product.name,
          price: product.price,
          stock: product.stock,
          description: product.description || '-',
          formattedPrice: `Rp ${product.price.toLocaleString('id-ID')}`,
        },
        message: `Berhasil mengambil data produk No. ${number}`,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal mengambil produk: ${err?.message || 'Unknown error'}` };
    }
  }

  // 1. Tambah Produk
  if (name === 'createProduct') {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([
          {
            name: args.name,
            price: Number(args.price),
            stock: Number(args.stock),
            description: args.description || '',
          },
        ])
        .select()
        .single();

      if (error) throw error;

      return {
        success: true,
        message: `Produk "${args.name}" berhasil ditambahkan (Harga: Rp ${Number(args.price).toLocaleString('id-ID')}, Stok: ${args.stock}). Deskripsi: "${args.description || '-'}"`,
        product: data,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal menambahkan produk: ${err?.message || 'Unknown error'}` };
    }
  }

  // 2. Update Produk (Nama / Deskripsi / Harga / Stok)
  if (name === 'updateProduct') {
    try {
      const target = args.identifier || args.currentName || args.productName;
      const { product, error: findError } = await resolveProduct(target);

      if (findError || !product) {
        return { success: false, message: `Produk "${target}" tidak ditemukan di database.` };
      }

      const updates: any = {};
      if (args.newName) updates.name = args.newName;
      if (args.newDescription !== undefined) updates.description = args.newDescription;
      if (args.newPrice !== undefined) updates.price = Number(args.newPrice);
      if (args.newStock !== undefined) updates.stock = Number(args.newStock);

      const { data, error: updateError } = await supabase
        .from('products')
        .update(updates)
        .eq('id', product.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return {
        success: true,
        message: `Produk "${product.name}" berhasil diperbarui. Harga: Rp ${data.price.toLocaleString('id-ID')}, Stok: ${data.stock}, Deskripsi: "${data.description || '-'}"`,
        product: data,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal memperbarui produk: ${err?.message || 'Unknown error'}` };
    }
  }

  // 3. Tambah Stok Masuk (Restok / Kulakan)
  if (name === 'addStock') {
    try {
      const target = args.identifier || args.productName;
      const { product, error: findError } = await resolveProduct(target);

      if (findError || !product) {
        return { success: false, message: `Produk "${target}" tidak ditemukan di database.` };
      }

      const addition = Number(args.additionalStock);
      const newStock = (product.stock || 0) + addition;

      const { data, error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', product.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return {
        success: true,
        message: `Stok produk "${product.name}" bertambah +${addition} unit (kini total ${newStock} unit).`,
        product: data,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal menambah stok: ${err?.message || 'Unknown error'}` };
    }
  }

  // 4. Kasir & Catat Penjualan (recordSale)
  if (name === 'recordSale') {
    try {
      const items = args.items || [];
      if (items.length === 0) {
        return { success: false, message: 'Tidak ada item dalam transaksi.' };
      }

      const receipt = [];
      let totalAmount = 0;

      for (const item of items) {
        const { product, error: findError } = await resolveProduct(item.productName);

        if (findError || !product) {
          return { success: false, message: `Produk "${item.productName}" tidak ditemukan.` };
        }

        const qty = Number(item.quantity) || 1;

        if (product.stock < qty) {
          return {
            success: false,
            message: `Stok "${product.name}" tidak mencukupi (tersedia: ${product.stock}, diminta: ${qty}).`,
          };
        }

        const subtotal = product.price * qty;
        totalAmount += subtotal;

        const remainingStock = product.stock - qty;
        await supabase
          .from('products')
          .update({ stock: remainingStock })
          .eq('id', product.id);

        receipt.push({
          name: product.name,
          qty,
          price: product.price,
          subtotal,
          remainingStock,
        });
      }

      const payment = Number(args.paymentAmount) || 0;
      const change = payment > 0 ? payment - totalAmount : 0;

      return {
        success: true,
        message: `Transaksi kasir berhasil dicatat dan stok dipotong otomatis.`,
        transaction: {
          items: receipt,
          totalAmount,
          paymentAmount: payment,
          change: change >= 0 ? change : 0,
        },
      };
    } catch (err: any) {
      return { success: false, message: `Gagal mencatat transaksi: ${err?.message || 'Unknown error'}` };
    }
  }

  // 5. Cari & Filter Produk
  if (name === 'searchProducts') {
    try {
      let query = supabase.from('products').select('*');

      if (args.query) {
        query = query.or(`name.ilike.%${args.query}%,description.ilike.%${args.query}%`);
      }
      if (args.maxPrice) {
        query = query.lte('price', Number(args.maxPrice));
      }
      if (args.minPrice) {
        query = query.gte('price', Number(args.minPrice));
      }
      if (args.lowStockOnly) {
        query = query.lte('stock', 10);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

      if (error) throw error;

      return {
        success: true,
        count: data?.length || 0,
        products: (data || []).slice(0, 15).map((p, idx) => ({
          no: idx + 1,
          name: p.name,
          price: p.price,
          stock: p.stock,
          description: p.description,
        })),
        message: `Ditemukan ${data?.length || 0} produk sesuai kriteria.`,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal mencari produk: ${err?.message || 'Unknown error'}` };
    }
  }

  // 6. Analisis Bisnis Warung
  if (name === 'getStoreAnalytics') {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .order('price', { ascending: true });

      if (error) throw error;
      if (!products || products.length === 0) {
        return { success: true, message: 'Toko belum memiliki produk.', analytics: null };
      }

      const totalItems = products.length;
      const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
      const totalInventoryValue = products.reduce((acc, p) => acc + (p.price * (p.stock || 0)), 0);

      const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= 10);
      const outOfStockProducts = products.filter((p) => p.stock <= 0);

      const cheapest = products[0];
      const mostExpensive = products[products.length - 1];

      return {
        success: true,
        analytics: {
          totalProducts: totalItems,
          totalStockUnits: totalUnits,
          totalInventoryValue,
          formattedInventoryValue: `Rp ${totalInventoryValue.toLocaleString('id-ID')}`,
          lowStockCount: lowStockProducts.length,
          lowStockList: lowStockProducts.map((p) => `${p.name} (sisa ${p.stock})`),
          outOfStockCount: outOfStockProducts.length,
          outOfStockList: outOfStockProducts.map((p) => p.name),
          cheapestProduct: { name: cheapest.name, price: cheapest.price },
          mostExpensiveProduct: { name: mostExpensive.name, price: mostExpensive.price },
        },
      };
    } catch (err: any) {
      return { success: false, message: `Gagal menganalisis warung: ${err?.message || 'Unknown error'}` };
    }
  }

  // 7. Hapus Produk (Satuan atau Semua)
  if (name === 'deleteProduct') {
    const target = (args.identifier || args.productName || '').trim().toLowerCase();

    // Hapus semua jika diminta
    if (
      args.deleteAll ||
      target.includes('semua') ||
      target.includes('all') ||
      target === 'data' ||
      target === 'semua data' ||
      target === 'semua produk'
    ) {
      try {
        const { data, error } = await supabase
          .from('products')
          .delete()
          .not('id', 'is', null)
          .select();

        if (error) throw error;

        return {
          success: true,
          message: `Semua data produk (${data?.length || 0} produk) berhasil dihapus. Tabel sekarang kosong.`,
        };
      } catch (err: any) {
        return { success: false, message: `Gagal menghapus semua data: ${err?.message || 'Unknown error'}` };
      }
    }

    // Hapus satuan
    try {
      const { product, error: findError } = await resolveProduct(target);

      if (findError || !product) {
        return { success: false, message: `Produk "${target}" tidak ditemukan di database.` };
      }

      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', product.id);

      if (deleteError) throw deleteError;

      return {
        success: true,
        message: `Produk "${product.name}" berhasil dihapus dari database.`,
      };
    } catch (err: any) {
      return { success: false, message: `Gagal menghapus produk: ${err?.message || 'Unknown error'}` };
    }
  }

  // 8. Ambil Semua Produk
  if (name === 'getProducts') {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });

      if (error) throw error;

      return {
        success: true,
        message: `Berhasil mengambil ${data?.length || 0} produk.`,
        products: (data || []).slice(0, 20).map((p, idx) => ({
          no: idx + 1,
          name: p.name,
          price: p.price,
          stock: p.stock,
          description: p.description,
        })),
      };
    } catch (err: any) {
      return { success: false, message: `Gagal mengambil produk: ${err?.message || 'Unknown error'}` };
    }
  }

  return { success: false, message: `Tool "${name}" tidak dikenal` };
}

function textStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(formatStreamPart('text', text)));
      controller.close();
    },
  });
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'GROQ_API_KEY belum diset di .env.local' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages } = await req.json();

    // OPTIMASI TOKEN: Hanya kirim 5 pesan terakhir untuk free tier (TPM limit 8K)
    const recentMessages = (messages || []).slice(-5); // Turunkan ke 5 untuk avoid rate limit di free tier

    // PRE-PROCESSING: Deteksi pattern pertanyaan produk spesifik
    const lastUserMessage = (recentMessages[recentMessages.length - 1]?.content || '').toLowerCase().trim();
    
    // Pattern untuk mendeteksi query "data no 1", "produk nomor 2", dll
    const productNumPattern = /(?:apa|lihat|tampil|show|cek|info|detail|isi)?\s*(?:data|produk|item|barang)?\s*(?:no|nomor|number|#)?\s*(\d+)/i;
    const match = lastUserMessage.match(productNumPattern);
    
    // Jika terdeteksi query produk spesifik, force execute tool langsung
    if (match && /(?:data|produk|item|no|nomor)/.test(lastUserMessage)) {
      const productNum = parseInt(match[1]);
      console.log(`[Pattern Detected] User menanyakan produk #${productNum}, force calling getProductByNumber...`);
      
      const result = await executeTool('getProductByNumber', { number: productNum });
      
      if (result.success && result.product) {
        const p = result.product;
        const formattedResponse = `Berikut data produk No. ${p.number}:\n\n` +
          `• **Nama**: ${p.name}\n` +
          `• **Harga**: ${p.formattedPrice}\n` +
          `• **Stok**: ${p.stock} unit\n` +
          `• **Deskripsi**: ${p.description}\n\n` +
          `Ada yang bisa saya bantu lagi? 😊`;
        
        return new StreamingTextResponse(textStream(formattedResponse));
      } else {
        return new StreamingTextResponse(textStream(result.message || 'Produk tidak ditemukan.'));
      }
    }

    // Build dynamic system message with current product context
    const SYSTEM_MESSAGE = await buildSystemMessage();

    const sanitizedMessages = [
      SYSTEM_MESSAGE,
      ...recentMessages.map((m: any) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
    ];

    // Step 1: Panggil Groq dengan auto-retry
    const firstRes = await fetchWithRetry(GROQ_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: sanitizedMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    if (!firstRes.ok) {
      const errText = await firstRes.text();
      console.error('Groq API Error:', firstRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Groq API Error (${firstRes.status}): ${errText}` }),
        { status: firstRes.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const firstData = await firstRes.json();
    const choice = firstData.choices?.[0];
    const message = choice?.message;

    // LOGGING: Track AI decision untuk debugging
    const isProductQuery = /(?:data|produk|item|barang)\s*(?:no|nomor|number|#)?\s*\d+/i.test(lastUserMessage);
    const toolCalled = message?.tool_calls?.[0]?.function?.name || 'none';
    
    console.log({
      timestamp: new Date().toISOString(),
      userQuery: lastUserMessage.substring(0, 100),
      isProductQuery,
      toolCalled,
      expectedTool: isProductQuery ? 'getProductByNumber' : 'any',
      mismatch: isProductQuery && toolCalled === 'none',
      model: MODEL,
    });

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Tidak ada respons dari AI' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // VALIDATION: Cek apakah AI seharusnya memanggil tool tapi tidak melakukannya
    const shouldHaveCalledTool = /(?:apa|lihat|tampil|show|cek|info|detail|isi)\s*(?:data|produk|item|barang)\s*(?:no|nomor|number|#)?\s*\d+/i.test(lastUserMessage);
    
    if (shouldHaveCalledTool && (!message.tool_calls || message.tool_calls.length === 0)) {
      console.warn('[Validation Failed] AI tidak memanggil tool untuk query produk spesifik. Forcing retry...');
      
      // Retry dengan instruksi eksplisit
      const retryMessages = [
        ...sanitizedMessages,
        {
          role: 'user',
          content: `${lastUserMessage}\n\n[SYSTEM OVERRIDE: User menanyakan produk spesifik. WAJIB gunakan tool getProductByNumber. JANGAN jawab tanpa memanggil tool!]`
        }
      ];

      const retryRes = await fetchWithRetry(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: retryMessages,
          tools: TOOLS,
          tool_choice: { type: 'function', function: { name: 'getProductByNumber' } }, // Force tool call
          temperature: 0.05,
        }),
      });

      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryMessage = retryData.choices?.[0]?.message;
        
        if (retryMessage?.tool_calls && retryMessage.tool_calls.length > 0) {
          console.log('[Validation] Retry berhasil, AI memanggil tool');
          // Update message untuk diproses di step selanjutnya
          message.tool_calls = retryMessage.tool_calls;
        }
      }
    }

    // Step 2: Eksekusi tools jika diminta
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults = [];

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          args = {};
        }

        const result = await executeTool(name, args);

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Step 3: Kirim hasil tool kembali ke Groq dan streaming jawabannya
      const followUpMessages = [
        ...sanitizedMessages,
        message,
        ...toolResults,
      ];

      const secondRes = await fetchWithRetry(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: followUpMessages,
          stream: true,
          temperature: 0.1,
        }),
      });

      if (!secondRes.ok) {
        const errText = await secondRes.text();
        console.error('Groq Stream Error:', secondRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Groq Stream Error: ${errText}` }),
          { status: secondRes.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const stream = OpenAIStream(secondRes);
      return new StreamingTextResponse(stream);
    }

    // Tidak ada pemanggilan tool — stream pesan langsung
    return new StreamingTextResponse(textStream(message.content || ''));
  } catch (error: any) {
    console.error('Unexpected error in /api/chat:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
