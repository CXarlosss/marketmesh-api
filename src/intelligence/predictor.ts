import db from '../db.js';

export interface StockPrediction {
  productId: number;
  productName: string;
  currentStock: number;
  velocity: number;        // ventas/hora
  hoursUntilEmpty: number | null;
  risk: 'critical' | 'warning' | 'safe';
  suggestion: string;
}

export function predictStockShortage(): StockPrediction[] {
  const products = db.prepare('SELECT * FROM products WHERE stock > 0').all() as any[];
  
  return products.map(p => {
    const velocity = p.velocity || 0;
    const hoursUntilEmpty = velocity > 0 ? p.stock / velocity : null;
    
    let risk: 'critical' | 'warning' | 'safe' = 'safe';
    let suggestion = 'Stock stable';
    
    if (hoursUntilEmpty !== null) {
      if (hoursUntilEmpty < 24) {
        risk = 'critical';
        suggestion = `Restock NOW! Empty in ${Math.round(hoursUntilEmpty)}h`;
      } else if (hoursUntilEmpty < 72) {
        risk = 'warning';
        suggestion = `Restock soon. Empty in ${Math.round(hoursUntilEmpty)}h`;
      } else if (p.trend === 'rising') {
        suggestion = `Trending up. Monitor closely`;
      }
    }
    
    return {
      productId: p.id,
      productName: p.name,
      currentStock: p.stock,
      velocity,
      hoursUntilEmpty: hoursUntilEmpty ? Math.round(hoursUntilEmpty) : null,
      risk,
      suggestion,
    };
  }).filter(p => p.risk !== 'safe' || p.velocity > 0.3);
}

export function getPredictionsForCart(cartIds: number[]): StockPrediction[] {
  const allPredictions = predictStockShortage();
  return allPredictions.filter(p => cartIds.includes(p.productId));
}
