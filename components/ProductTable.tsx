'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Package, Loader2, Trash2 } from 'lucide-react';
import type { Product } from '@/lib/supabase';
import { useState } from 'react';

async function fetchProducts(): Promise<Product[]> {
  const response = await fetch('/api/products');
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch products');
  }
  
  return data.products;
}

export function ProductTable() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: products, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: fetchProducts,
    refetchInterval: 3000, // Auto-refresh every 3 seconds
  });

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus produk "${name}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['products'] });
      }
    } catch (err) {
      console.error('Failed to delete product:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Package className="h-5 w-5" />
            Daftar Produk
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Data produk akan terupdate otomatis secara real-time
          </p>
        </div>
        {products && products.length > 0 && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground border">
            {products.length} produk
          </span>
        )}
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-destructive">
            <p>Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          </div>
        ) : !products || products.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Belum ada produk</p>
            <p className="text-xs mt-1 text-muted-foreground">
              Tambahkan produk melalui chat AI Copilot di sebelah kiri
            </p>
          </div>
        ) : (
          <div className="p-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 text-center font-semibold">No</TableHead>
                  <TableHead className="font-semibold">Nama Produk</TableHead>
                  <TableHead className="font-semibold">Harga</TableHead>
                  <TableHead className="text-center font-semibold">Stok</TableHead>
                  <TableHead className="font-semibold">Deskripsi</TableHead>
                  <TableHead className="w-12 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product, index) => (
                  <TableRow key={product.id} className="transition-colors">
                    {/* Kolom Nomor Urut */}
                    <TableCell className="text-center text-xs font-semibold text-muted-foreground w-12">
                      {index + 1}
                    </TableCell>

                    {/* Nama Produk */}
                    <TableCell className="font-medium text-foreground">
                      {product.name}
                    </TableCell>

                    {/* Harga */}
                    <TableCell className="text-sm font-medium whitespace-nowrap">
                      {formatRupiah(product.price)}
                    </TableCell>

                    {/* Stok Badge */}
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 text-xs font-semibold rounded-full ${
                          product.stock > 20
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                            : product.stock > 10
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                        }`}
                      >
                        {product.stock}
                      </span>
                    </TableCell>

                    {/* Deskripsi */}
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={product.description}>
                      {product.description || '-'}
                    </TableCell>

                    {/* Aksi Hapus Satuan */}
                    <TableCell className="w-12 text-center p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Hapus produk"
                        disabled={deletingId === product.id}
                        onClick={() => handleDelete(product.id, product.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ScrollArea>

      {products && products.length > 0 && (
        <div className="p-3 border-t text-xs text-muted-foreground bg-muted/20 flex justify-between items-center">
          <span>Menampilkan {products.length} produk</span>
          <span>Auto-refresh setiap 3 detik</span>
        </div>
      )}
    </Card>
  );
}
