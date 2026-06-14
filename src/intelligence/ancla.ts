import db from '../db.js';

export interface AnclaProduct {
  id: number;
  name: string;
  category: string;
  centralityScore: number;
  description: string;
}

export function detectAnclas(): AnclaProduct[] {
  // Centralidad: productos que aparecen en muchas órdenes diversas
  const products = db.prepare('SELECT * FROM products').all() as any[];
  
  const anclas: AnclaProduct[] = products.map((p: any) => {
    // Órdenes que contienen este producto
    const ordersWithProduct = db.prepare(`
      SELECT items FROM orders WHERE items LIKE ?
    `).all(`%"productId":${p.id}%`);
    
    // Diversidad de categorías en co-compras
    const coCategories = new Set<string>();
    let totalCoProducts = 0;
    
    for (const order of ordersWithProduct as any[]) {
      const items: any[] = JSON.parse(order.items);
      for (const item of items) {
        if (item.productId !== p.id) {
          const other = db.prepare('SELECT category FROM products WHERE id = ?').get(item.productId) as any;
          if (other) {
            coCategories.add(other.category);
            totalCoProducts++;
          }
        }
      }
    }
    
    // Score de centralidad: diversidad * frecuencia
    const centrality = ordersWithProduct.length > 0 
      ? (coCategories.size * Math.sqrt(totalCoProducts)) / ordersWithProduct.length
      : 0;
    
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      centralityScore: Number(centrality.toFixed(2)),
      description: centrality > 2 
        ? `Drives sales across ${coCategories.size} categories`
        : `Standard ${p.category} item`,
    };
  });
  
  return anclas
    .filter(a => a.centralityScore > 1.5)
    .sort((a, b) => b.centralityScore - a.centralityScore)
    .slice(0, 5);
}
