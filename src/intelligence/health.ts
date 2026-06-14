import db from '../db.js';

export interface HealthScore {
  score: number;           // 0-100
  status: 'excellent' | 'good' | 'fair' | 'critical';
  metrics: {
    stockDiversity: number;    // ¿Hay variedad de stock?
    velocityBalance: number;   // ¿Los productos se mueven?
    categorySpread: number;    // ¿Diversidad de categorías?
    recentActivity: number;    // ¿Ventas en las últimas 24h?
  };
  warnings: string[];
}

export function calculateHealth(): HealthScore {
  const warnings: string[] = [];
  
  // Métrica 1: Diversidad de stock (productos con stock > 0 / total)
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  const stockedProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE stock > 10').get() as { c: number };
  const stockDiversity = (stockedProducts.c / totalProducts.c) * 100;
  
  if (stockDiversity < 70) warnings.push('Low stock diversity');
  
  // Métrica 2: Balance de velocidad (coeficiente de variación de velocity)
  const velocities = db.prepare('SELECT velocity FROM products WHERE velocity > 0').all() as any[];
  const avgVel = velocities.reduce((sum, v) => sum + v.velocity, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + Math.pow(v.velocity - avgVel, 2), 0) / velocities.length;
  const cv = avgVel > 0 ? Math.sqrt(variance) / avgVel : 0;
  const velocityBalance = Math.max(0, 100 - (cv * 50)); // Menos variación = mejor
  
  if (velocityBalance < 60) warnings.push('Uneven sales velocity');
  
  // Métrica 3: Spread de categorías (entropía simplificada)
  const categories = db.prepare('SELECT category, COUNT(*) as c FROM products GROUP BY category').all() as any[];
  const totalCat = categories.reduce((sum, c) => sum + c.c, 0);
  const entropy = categories.reduce((sum, c) => {
    const p = c.c / totalCat;
    return sum - (p * Math.log(p));
  }, 0);
  const categorySpread = Math.min(100, entropy * 40);
  
  // Métrica 4: Actividad reciente (órdenes últimas 24h)
  const yesterday = new Date(Date.now() - 24 * 3600000).toISOString();
  const recentOrders = db.prepare('SELECT COUNT(*) as c FROM orders WHERE created_at > ?').get(yesterday) as { c: number };
  const recentActivity = Math.min(100, recentOrders.c * 5); // 20+ órdenes = 100
  
  if (recentActivity < 30) warnings.push('Low recent activity');
  
  // Score ponderado
  const score = Math.round(
    stockDiversity * 0.25 +
    velocityBalance * 0.25 +
    categorySpread * 0.25 +
    recentActivity * 0.25
  );
  
  let status: HealthScore['status'] = 'critical';
  if (score >= 80) status = 'excellent';
  else if (score >= 60) status = 'good';
  else if (score >= 40) status = 'fair';
  
  if (score < 40) warnings.push('Marketplace health critical');
  
  return {
    score,
    status,
    metrics: {
      stockDiversity: Math.round(stockDiversity),
      velocityBalance: Math.round(velocityBalance),
      categorySpread: Math.round(categorySpread),
      recentActivity: Math.round(recentActivity),
    },
    warnings,
  };
}
