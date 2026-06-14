import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import db from './db.js';
import { getRecommendations, getCartRecommendations } from './intelligence/recommender.js';
import { predictStockShortage, getPredictionsForCart } from './intelligence/predictor.js';
import { detectAnclas } from './intelligence/ancla.js';
import { calculateHealth } from './intelligence/health.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: '*' });
await app.register(websocket);

// --- REST API ---

// Productos
app.get('/api/products', async () => {
  return db.prepare('SELECT * FROM products').all();
});

app.get('/api/products/:id', async (req) => {
  const { id } = req.params as { id: string };
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
});

// Órdenes
app.post('/api/orders', async (req) => {
  const { items } = req.body as { items: any[] };
  let total = 0;
  
  for (const item of items) {
    const product = db.prepare('SELECT price, stock FROM products WHERE id = ?').get(item.productId) as any;
    if (!product || product.stock < item.quantity) {
      return { error: `Insufficient stock for product ${item.productId}` };
    }
    total += product.price * item.quantity;
  }
  
  // Crear orden
  const result = db.prepare('INSERT INTO orders (items, total) VALUES (?, ?)')
    .run(JSON.stringify(items), total.toFixed(2));
  
  // Actualizar stock y registrar eventos
  for (const item of items) {
    const current = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId) as any;
    const newStock = current.stock - item.quantity;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(newStock, item.productId);
    db.prepare('INSERT INTO stock_events (product_id, event_type, quantity, stock_after) VALUES (?, ?, ?, ?)')
      .run(item.productId, 'sale', item.quantity, newStock);
  }
  
  return { id: result.lastInsertRowid, items, total: total.toFixed(2) };
});

// Inteligencia
app.get('/api/recommendations/:productId', async (req) => {
  const { productId } = req.params as { productId: string };
  return getRecommendations(Number(productId));
});

app.get('/api/health', async () => {
  return calculateHealth();
});

app.get('/api/anclas', async () => {
  return detectAnclas();
});

app.get('/api/predictions', async () => {
  return predictStockShortage();
});

app.post('/api/checkout/analyze', async (req) => {
  const { items } = req.body as { items: { productId: number; quantity: number }[] };
  
  const cartIds = items.map(i => i.productId);
  const predictions = getPredictionsForCart(cartIds);
  const recommendations = getCartRecommendations(cartIds, 3);
  
  // Alertas predictivas: productos que se agotan pronto Y están relacionados
  const urgentAlerts = predictions.filter(p => p.risk === 'critical' && p.hoursUntilEmpty !== null);
  
  // Sugerencias cruzadas: si compras café, ¿necesitas leche?
  const crossSells = recommendations.filter(r => !cartIds.includes(r.id)).slice(0, 2);
  
  return {
    alerts: urgentAlerts.map(p => ({
      productId: p.productId,
      productName: p.productName,
      message: p.suggestion,
      urgency: p.risk,
    })),
    crossSells: crossSells.map(r => ({
      productId: r.id,
      productName: r.name,
      reason: r.reason,
      price: r.price,
    })),
    riskScore: urgentAlerts.length > 0 ? 'high' : crossSells.length > 0 ? 'medium' : 'low',
  };
});

// --- WebSocket: Tiempo real ---

app.get('/ws/market', { websocket: true }, (connection) => {
  // Enviar health score cada 5 segundos
  const interval = setInterval(() => {
    const health = calculateHealth();
    connection.send(JSON.stringify({
      type: 'health_update',
      data: health,
    }));
  }, 5000);
  
  connection.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'cart_update') {
        const cartIds = data.productIds.map(Number);
        const recommendations = getCartRecommendations(cartIds);
        const predictions = getPredictionsForCart(cartIds);
        
        connection.send(JSON.stringify({
          type: 'cart_insights',
          recommendations,
          predictions: predictions.filter(p => p.risk !== 'safe'),
          timestamp: new Date().toISOString(),
        }));
      }
      
      if (data.type === 'get_health') {
        connection.send(JSON.stringify({
          type: 'health_update',
          data: calculateHealth(),
        }));
      }
    } catch (err) {
      connection.send(JSON.stringify({ type: 'error', message: 'Invalid format' }));
    }
  });
  
  connection.on('close', () => {
    clearInterval(interval);
  });
});

// Iniciar
const PORT = process.env.PORT || 3003;
await app.listen({ port: Number(PORT), host: '0.0.0.0' });
console.log(`🧠 MarketMesh API running on port ${PORT}`);
