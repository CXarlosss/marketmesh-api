import db from '../db.js';

export interface Recommendation {
  id: number;
  name: string;
  category: string;
  price: number;
  image_url: string;
  score: number;
  reason: string;
}

export function getRecommendations(productId: number, limit = 5): Recommendation[] {
  // Órdenes que contienen este producto
  const ordersWithProduct = db.prepare(`
    SELECT items FROM orders WHERE items LIKE ?
  `).all(`%"productId":${productId}%`);
  
  if (ordersWithProduct.length === 0) return [];
  
  // Contar co-ocurrencias
  const coOccurrences = new Map<number, { count: number; totalQty: number }>();
  
  for (const order of ordersWithProduct as any[]) {
    const items: any[] = JSON.parse(order.items);
    for (const item of items) {
      if (item.productId !== productId) {
        const existing = coOccurrences.get(item.productId) || { count: 0, totalQty: 0 };
        existing.count += 1;
        existing.totalQty += item.quantity;
        coOccurrences.set(item.productId, existing);
      }
    }
  }
  
  // Jaccard exacto
  const scores: { id: number; score: number }[] = [];
  const totalA = ordersWithProduct.length;
  
  for (const [otherId, data] of coOccurrences) {
    const ordersWithB = db.prepare(`
      SELECT COUNT(*) as count FROM orders WHERE items LIKE ?
    `).get(`%"productId":${otherId}%`) as { count: number };
    
    const intersection = data.count;
    const union = totalA + ordersWithB.count - intersection;
    const jaccard = union > 0 ? intersection / union : 0;
    
    if (jaccard > 0.05) { // threshold mínimo
      scores.push({ id: otherId, score: jaccard });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  const topIds = scores.slice(0, limit).map(s => s.id);
  if (topIds.length === 0) return [];
  
  const placeholders = topIds.map(() => '?').join(',');
  const products = db.prepare(`
    SELECT * FROM products WHERE id IN (${placeholders})
  `).all(...topIds) as any[];
  
  return products.map(p => {
    const score = scores.find(s => s.id === p.id)?.score || 0;
    return {
      ...p,
      score: Number(score.toFixed(3)),
      reason: `Bought together in ${Math.round(score * 100)}% of orders`,
    };
  }).sort((a, b) => b.score - a.score);
}

export function getCartRecommendations(cartIds: number[], limit = 5): Recommendation[] {
  const aggregated = new Map<number, { product: any; totalScore: number; reasons: string[] }>();
  
  for (const cartId of cartIds) {
    const recs = getRecommendations(cartId, 10);
    for (const rec of recs) {
      if (cartIds.includes(rec.id)) continue;
      
      if (!aggregated.has(rec.id)) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(rec.id);
        if (!product) continue;
        aggregated.set(rec.id, { product, totalScore: 0, reasons: [] });
      }
      
      const entry = aggregated.get(rec.id)!;
      entry.totalScore += rec.score;
      entry.reasons.push(`With ${cartId}`);
    }
  }
  
  return Array.from(aggregated.values())
    .map(({ product, totalScore, reasons }) => ({
      ...product,
      score: Number(totalScore.toFixed(3)),
      reason: `Matches ${reasons.length} items in your cart`,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
