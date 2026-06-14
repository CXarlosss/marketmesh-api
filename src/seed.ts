import db from './db.js';

const products = [
  { name: 'Manzana Roja', category: 'frutas', price: 1.20, stock: 150, image_url: '🍎' },
  { name: 'Plátano', category: 'frutas', price: 0.80, stock: 200, image_url: '🍌' },
  { name: 'Naranja', category: 'frutas', price: 1.50, stock: 120, image_url: '🍊' },
  { name: 'Uvas', category: 'frutas', price: 2.50, stock: 80, image_url: '🍇' },
  { name: 'Fresa', category: 'frutas', price: 3.00, stock: 60, image_url: '🍓' },
  { name: 'iPhone 15', category: 'electrónica', price: 999.00, stock: 25, image_url: '📱' },
  { name: 'AirPods Pro', category: 'electrónica', price: 249.00, stock: 40, image_url: '🎧' },
  { name: 'MacBook Air', category: 'electrónica', price: 1299.00, stock: 15, image_url: '💻' },
  { name: 'Cargador USB-C', category: 'electrónica', price: 25.00, stock: 100, image_url: '🔌' },
  { name: 'Funda iPhone', category: 'electrónica', price: 35.00, stock: 200, image_url: '📲' },
  { name: 'Camiseta Blanca', category: 'ropa', price: 15.00, stock: 300, image_url: '👕' },
  { name: 'Jeans Azules', category: 'ropa', price: 45.00, stock: 180, image_url: '👖' },
  { name: 'Zapatillas Nike', category: 'ropa', price: 89.00, stock: 90, image_url: '👟' },
  { name: 'Chaqueta Cuero', category: 'ropa', price: 120.00, stock: 45, image_url: '🧥' },
  { name: 'Gorra', category: 'ropa', price: 22.00, stock: 250, image_url: '🧢' },
  { name: 'Pan Integral', category: 'alimentos', price: 2.20, stock: 400, image_url: '🍞' },
  { name: 'Leche', category: 'alimentos', price: 1.10, stock: 500, image_url: '🥛' },
  { name: 'Queso', category: 'alimentos', price: 4.50, stock: 120, image_url: '🧀' },
  { name: 'Café Molido', category: 'alimentos', price: 6.00, stock: 80, image_url: '☕' },
  { name: 'Miel', category: 'alimentos', price: 5.50, stock: 95, image_url: '🍯' },
];

// Insertar productos
const insertProduct = db.prepare(`
  INSERT INTO products (name, category, price, stock, image_url) 
  VALUES (?, ?, ?, ?, ?)
`);
products.forEach(p => insertProduct.run(p.name, p.category, p.price, p.stock, p.image_url));

// Generar 200 órdenes con patrones realistas + timestamps distribuidos
const patterns = [
  { items: [{id: 1, qty: 3}, {id: 2, qty: 2}, {id: 17, qty: 1}], weight: 15 },   // frutas + leche
  { items: [{id: 1, qty: 5}, {id: 19, qty: 1}], weight: 10 },                      // manzana + café
  { items: [{id: 6, qty: 1}, {id: 7, qty: 1}, {id: 10, qty: 1}], weight: 12 },    // iPhone ecosystem
  { items: [{id: 6, qty: 1}, {id: 9, qty: 2}], weight: 8 },                       // iPhone + cargador
  { items: [{id: 8, qty: 1}, {id: 9, qty: 1}, {id: 7, qty: 1}], weight: 6 },     // MacBook + accesorios
  { items: [{id: 11, qty: 2}, {id: 12, qty: 1}, {id: 13, qty: 1}], weight: 14 },  // outfit básico
  { items: [{id: 12, qty: 1}, {id: 14, qty: 1}], weight: 9 },                    // jeans + chaqueta
  { items: [{id: 16, qty: 2}, {id: 17, qty: 1}, {id: 18, qty: 1}], weight: 13 }, // desayuno completo
  { items: [{id: 17, qty: 2}, {id: 19, qty: 1}], weight: 11 },                    // leche + café
  { items: [{id: 5, qty: 1}, {id: 20, qty: 1}], weight: 7 },                      // fresa + miel
];

const insertOrder = db.prepare('INSERT INTO orders (items, total, created_at) VALUES (?, ?, ?)');
const insertStockEvent = db.prepare('INSERT INTO stock_events (product_id, event_type, quantity, stock_after) VALUES (?, ?, ?, ?)');

// Función para generar fecha aleatoria en los últimos 30 días
function randomDate(): string {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 30);
  const hoursAgo = Math.floor(Math.random() * 24);
  const date = new Date(now.getTime() - (daysAgo * 24 + hoursAgo) * 3600000);
  return date.toISOString();
}

// Expandir patrones según peso
const expandedPatterns: any[] = [];
patterns.forEach(p => {
  for (let i = 0; i < p.weight; i++) expandedPatterns.push(p.items);
});

// Generar 200 órdenes
for (let i = 0; i < 200; i++) {
  const pattern = expandedPatterns[i % expandedPatterns.length];
  const items = pattern.map((item: any) => ({
    productId: item.id,
    quantity: item.qty + Math.floor(Math.random() * 2), // variación
  }));
  
  // Calcular total
  let total = 0;
  items.forEach((item: any) => {
    const product = db.prepare('SELECT price FROM products WHERE id = ?').get(item.productId) as any;
    total += product.price * item.quantity;
  });
  
  const date = randomDate();
  insertOrder.run(JSON.stringify(items), total.toFixed(2), date);
  
  // Registrar eventos de stock
  items.forEach((item: any) => {
    const current = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId) as any;
    const newStock = Math.max(0, current.stock - item.quantity);
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.productId);
    insertStockEvent.run(item.productId, 'sale', item.quantity, newStock);
  });
}

// Calcular velocidad de venta (ventas/hora en los últimos 7 días)
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
products.forEach((p, idx) => {
  const sales = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total 
    FROM stock_events 
    WHERE product_id = ? AND event_type = 'sale' AND created_at > ?
  `).get(idx + 1, sevenDaysAgo) as { total: number };
  
  const velocity = Number((sales.total / (7 * 24)).toFixed(2));
  let trend = 'stable';
  if (velocity > 0.5) trend = 'rising';
  if (velocity < 0.1) trend = 'falling';
  
  db.prepare('UPDATE products SET velocity = ?, trend = ? WHERE id = ?')
    .run(velocity, trend, idx + 1);
});

console.log('✅ Seeded 20 products, 200 orders, stock events, and calculated velocities');
