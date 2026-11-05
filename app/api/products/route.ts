import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET all products
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, products: data });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

// DELETE product(s)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const all = searchParams.get('all');

    if (all === 'true') {
      const { data, error } = await supabase
        .from('products')
        .delete()
        .not('id', 'is', null)
        .select();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: `Berhasil menghapus ${data?.length || 0} produk.`,
      });
    }

    if (id) {
      const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)
        .select();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: 'Produk berhasil dihapus.',
        product: data?.[0],
      });
    }

    return NextResponse.json(
      { success: false, error: 'Parameter id atau all=true diperlukan' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting product(s):', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
