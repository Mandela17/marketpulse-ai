import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface BlockDeal {
  id: string;
  symbol: string;
  timestamp: string;
  price: number;
  quantity: number;
  valueCr: number;
  buyerName: string;
  sellerName: string;
  dealType: 'Block' | 'Ultra Block';
  action: 'BUY' | 'SELL';
}

const ALL_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'BHARTIRTEL', 'ICICIBANK', 'INFOSYS', 'SBI', 
  'LICI', 'ITC', 'HINDUNILVR', 'LT', 'BAJFINANCE', 'KOTAKBANK', 'AXISBANK', 
  'MARUTI', 'SUNPHARMA', 'WIPRO', 'HCLTECH', 'NTPC', 'ONGC', 'TATASTEEL', 
  'TITAN', 'ADANIENT', 'DRREDDY', 'CIPLA'
];

const INSTITUTIONS = {
  FII: [
    'Morgan Stanley Asia', 'Societe Generale', 'Goldman Sachs Singapore', 
    'UBS Principal Finance', 'Merrill Lynch LLP', 'JP Morgan Mutual Fund', 
    'Nomura Singapore', 'BofA Securities', 'Government Pension Fund Global', 
    'Calgary Investment LLC'
  ],
  DII: [
    'SBI Mutual Fund', 'HDFC Mutual Fund', 'ICICI Prudential MF', 
    'Axis Mutual Fund', 'Nippon India MF', 'LIC of India', 
    'Kotak Mahindra MF', 'UTI Mutual Fund', 'Mirae Asset MF', 
    'Tata Mutual Fund'
  ],
  PROMOTERS: [
    'Promoter Group Entity', 'Founder Family Trust', 'Corporate Promoter Holdings'
  ]
};

// Generates high-fidelity block deals deterministically based on stock symbol or timestamp
function generateMockDeals(symbolFilter?: string, daysLimit = 30): BlockDeal[] {
  const deals: BlockDeal[] = [];
  const now = new Date();
  
  const targetStocks = symbolFilter ? [symbolFilter.toUpperCase()] : ALL_STOCKS;
  
  targetStocks.forEach((symbol) => {
    // Determine base stock price (mock but reasonable range)
    let basePrice = 1000;
    if (symbol === 'RELIANCE') basePrice = 2800;
    else if (symbol === 'TCS') basePrice = 3850;
    else if (symbol === 'HDFCBANK') basePrice = 1620;
    else if (symbol === 'BHARTIRTEL') basePrice = 1250;
    else if (symbol === 'ICICIBANK') basePrice = 1100;
    else if (symbol === 'INFOSYS') basePrice = 1530;
    else if (symbol === 'SBI') basePrice = 780;
    else if (symbol === 'MARUTI') basePrice = 11500;
    else if (symbol === 'TATASTEEL') basePrice = 145;
    else if (symbol === 'ADANIENT') basePrice = 3100;
    
    // Seed random generator deterministically per stock
    let seed = symbol.charCodeAt(0) + symbol.charCodeAt(symbol.length - 1);
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    // Number of deals for this stock
    const dealsCount = Math.floor(random() * 5) + 3; // 3 to 7 deals per stock
    
    for (let i = 0; i < dealsCount; i++) {
      const dayOffset = Math.floor(random() * daysLimit);
      const dealDate = new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000);
      
      // Randomize hours to market hours (9:15 AM to 3:30 PM IST / UTC equivalent)
      dealDate.setHours(9 + Math.floor(random() * 6), Math.floor(random() * 60), 0, 0);

      // Price slightly deviated from base price
      const priceDev = (random() - 0.5) * 0.04; // +/- 2%
      const price = Math.round(basePrice * (1 + priceDev) * 100) / 100;

      // Quantity & value
      const isUltra = random() > 0.7;
      const valueCr = isUltra 
        ? Math.round((50 + random() * 120) * 100) / 100  // 50 to 170 Cr
        : Math.round((10 + random() * 40) * 100) / 100;  // 10 to 50 Cr
        
      const quantity = Math.round((valueCr * 10000000) / price);
      
      // Buyer / Seller
      const buyerType = random() > 0.5 ? 'FII' : 'DII';
      const sellerType = random() > 0.6 ? 'PROMOTERS' : (buyerType === 'FII' ? 'DII' : 'FII');
      
      const buyerPool = INSTITUTIONS[buyerType];
      const sellerPool = INSTITUTIONS[sellerType];
      
      const buyerName = buyerPool[Math.floor(random() * buyerPool.length)];
      const sellerName = sellerPool[Math.floor(random() * sellerPool.length)];
      
      const dealType = isUltra ? 'Ultra Block' : 'Block';
      const action = random() > 0.4 ? 'BUY' : 'SELL';

      deals.push({
        id: `deal_${symbol}_${dealDate.getTime()}_${i}`,
        symbol,
        timestamp: dealDate.toISOString(),
        price,
        quantity,
        valueCr,
        buyerName,
        sellerName,
        dealType,
        action
      });
    }
  });

  // Sort by date newest first
  return deals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || undefined;
    const limitParam = searchParams.get('limit') ? parseInt(searchParams.get('limit') || '50') : 50;

    const allDeals = generateMockDeals(symbol);
    const results = allDeals.slice(0, limitParam);

    return NextResponse.json({
      success: true,
      count: results.length,
      deals: results
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
