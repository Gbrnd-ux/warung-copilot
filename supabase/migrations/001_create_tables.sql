-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  stock INT4 NOT NULL DEFAULT 0 CHECK (stock >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- Disable RLS (Row Level Security) for MVP
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- Insert sample data for testing
INSERT INTO products (name, price, stock, description) VALUES
  ('Kopi Susu Gula Aren', 15000, 50, 'Kopi susu dengan gula aren asli'),
  ('Teh Tarik Original', 12000, 30, 'Teh tarik khas warung kopi'),
  ('Nasi Goreng Spesial', 25000, 20, 'Nasi goreng dengan telur dan ayam');
