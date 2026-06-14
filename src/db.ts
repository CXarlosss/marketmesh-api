import Database from 'better-sqlite3';

const db = new Database('./marketmesh.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 100,
    image_url TEXT,
    velocity REAL DEFAULT 0,        -- ventas/hora promedio
    trend TEXT DEFAULT 'stable'    -- 'rising' | 'stable' | 'falling'
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    items TEXT NOT NULL,           -- JSON array de {productId, quantity}
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,      -- 'sale', 'restock', 'predicted_shortage'
    quantity INTEGER,
    stock_after INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

export default db;
