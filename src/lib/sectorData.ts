// Sector and Stock mapping for Indian markets
// Priority: Energy, Power, Auto, Gold, EV + others

export const SECTORS = {
  energy: {
    id: 'energy',
    name: 'Energy & Oil',
    icon: '⛽',
    stocks: ['RELIANCE', 'ONGC', 'IOC', 'BPCL', 'GAIL', 'HINDPETRO', 'PETRONET', 'OIL', 'MRPL', 'CASTROLIND'],
    globalExposure: 'Crude oil prices, OPEC decisions, Middle East tensions, US shale production',
    keywords: ['oil', 'crude', 'petroleum', 'OPEC', 'energy', 'gas', 'refinery', 'fuel', 'diesel', 'petrol'],
  },
  power: {
    id: 'power',
    name: 'Power & Utilities',
    icon: '⚡',
    stocks: ['NTPC', 'POWERGRID', 'TATAPOWER', 'ADANIGREEN', 'JSWENERGY', 'NHPC', 'SJVN', 'IREDA', 'CESC', 'TORNTPOWER'],
    globalExposure: 'Coal prices, renewable energy policies, monsoon impact, govt subsidies',
    keywords: ['power', 'electricity', 'solar', 'wind', 'renewable', 'grid', 'thermal', 'hydro', 'green energy'],
  },
  auto: {
    id: 'auto',
    name: 'Automobile',
    icon: '🚗',
    stocks: ['MARUTI', 'TATAMOTORS', 'M&M', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'ASHOKLEY', 'BHARATFORG', 'BOSCHLTD', 'MOTHERSON'],
    globalExposure: 'Steel prices, semiconductor supply, fuel prices, consumer demand, monsoon',
    keywords: ['auto', 'car', 'vehicle', 'EV', 'electric vehicle', 'automobile', 'motorcycle', 'scooter'],
  },
  gold: {
    id: 'gold',
    name: 'Gold & Precious Metals',
    icon: '🥇',
    stocks: ['TITAN', 'MUTHOOTFIN', 'MANAPPURAM', 'RAJESHEXPO', 'GOLDBEES', 'KALYANFIN', 'SENCO', 'PNGJL', 'TBZJEWEL'],
    globalExposure: 'US Dollar strength, Fed rates, geopolitical uncertainty, inflation hedging',
    keywords: ['gold', 'silver', 'precious', 'jewellery', 'jewelry', 'bullion', 'sovereign gold'],
  },
  ev: {
    id: 'ev',
    name: 'Electric Vehicles',
    icon: '🔋',
    stocks: ['TATAMOTORS', 'M&M', 'OLECTRA', 'EXIDEIND', 'AMARAJABAT', 'TATAELXSI', 'KPITTECH', 'GREAVESCOT', 'HAPPSTMNDS'],
    globalExposure: 'Lithium prices, battery tech breakthroughs, govt EV policies, charging infra',
    keywords: ['EV', 'electric vehicle', 'battery', 'lithium', 'charging', 'tesla', 'hybrid', 'BEV'],
  },
  banking: {
    id: 'banking',
    name: 'Banking & Finance',
    icon: '🏦',
    stocks: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK', 'BANDHANBNK', 'PNB', 'BANKBARODA', 'IDFCFIRSTB'],
    globalExposure: 'RBI repo rate, US Fed decisions, NPA levels, credit growth, foreign investments',
    keywords: ['bank', 'RBI', 'interest rate', 'loan', 'credit', 'NPA', 'deposit', 'monetary policy'],
  },
  it: {
    id: 'it',
    name: 'IT & Technology',
    icon: '💻',
    stocks: ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM', 'LTIM', 'PERSISTENT', 'COFORGE', 'MPHASIS', 'CYIENT'],
    globalExposure: 'US tech spending, rupee-dollar exchange, visa policies, AI disruption',
    keywords: ['IT', 'software', 'technology', 'digital', 'cloud', 'AI', 'outsourcing', 'tech'],
  },
  pharma: {
    id: 'pharma',
    name: 'Pharma & Healthcare',
    icon: '💊',
    stocks: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP', 'BIOCON', 'LUPIN', 'AUROPHARMA', 'TORNTPHARM', 'ALKEM'],
    globalExposure: 'FDA approvals, US generic drug pricing, pandemic risks, API supply chain',
    keywords: ['pharma', 'drug', 'FDA', 'medicine', 'hospital', 'healthcare', 'vaccine', 'generic'],
  },
  defense: {
    id: 'defense',
    name: 'Defense & Aerospace',
    icon: '🛡️',
    stocks: ['HAL', 'BEL', 'BHEL', 'SOLARINDS', 'COCHINSHIP', 'MAZAGON', 'GRSE', 'BDL', 'DATAPATTR', 'PARAS'],
    globalExposure: 'Border tensions, defense budget, Make in India orders, geopolitical conflicts',
    keywords: ['defense', 'defence', 'military', 'weapon', 'army', 'navy', 'air force', 'missile', 'border'],
  },
  metals: {
    id: 'metals',
    name: 'Metals & Mining',
    icon: '⛏️',
    stocks: ['TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'VEDL', 'COALINDIA', 'NMDC', 'SAIL', 'NATIONALUM', 'JINDALSTEL', 'MOIL'],
    globalExposure: 'China demand, global steel/aluminum prices, infrastructure spending, trade wars',
    keywords: ['steel', 'metal', 'mining', 'aluminum', 'copper', 'iron', 'ore', 'coal', 'zinc'],
  },
  fmcg: {
    id: 'fmcg',
    name: 'FMCG & Consumer',
    icon: '🛒',
    stocks: ['HINDUNILVR', 'ITC', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'GODREJCP', 'COLPAL', 'EMAMILTD', 'TATACONSUM'],
    globalExposure: 'Rural demand, monsoon season, palm oil prices, consumer inflation',
    keywords: ['FMCG', 'consumer', 'food', 'beverage', 'retail', 'grocery', 'personal care'],
  },
  realestate: {
    id: 'realestate',
    name: 'Real Estate & Infra',
    icon: '🏗️',
    stocks: ['DLF', 'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'BRIGADE', 'LTIM', 'LNTFH', 'IRB', 'NBCC', 'LODHA'],
    globalExposure: 'Interest rates, urbanization, govt housing schemes, cement/steel prices',
    keywords: ['real estate', 'property', 'housing', 'construction', 'infrastructure', 'cement'],
  },
};

// All unique stocks across sectors
export const ALL_STOCKS: { symbol: string; name: string; sector: string }[] = [
  // Energy
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'energy' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corporation', sector: 'energy' },
  { symbol: 'IOC', name: 'Indian Oil Corporation', sector: 'energy' },
  { symbol: 'BPCL', name: 'Bharat Petroleum Corp', sector: 'energy' },
  { symbol: 'GAIL', name: 'GAIL India', sector: 'energy' },
  // Power
  { symbol: 'NTPC', name: 'NTPC Limited', sector: 'power' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation', sector: 'power' },
  { symbol: 'TATAPOWER', name: 'Tata Power Company', sector: 'power' },
  { symbol: 'ADANIGREEN', name: 'Adani Green Energy', sector: 'power' },
  { symbol: 'JSWENERGY', name: 'JSW Energy', sector: 'power' },
  { symbol: 'NHPC', name: 'NHPC Limited', sector: 'power' },
  { symbol: 'IREDA', name: 'Indian Renewable Energy Dev', sector: 'power' },
  // Auto
  { symbol: 'MARUTI', name: 'Maruti Suzuki India', sector: 'auto' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'auto' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'auto' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'auto' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', sector: 'auto' },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'auto' },
  // Gold
  { symbol: 'TITAN', name: 'Titan Company', sector: 'gold' },
  { symbol: 'MUTHOOTFIN', name: 'Muthoot Finance', sector: 'gold' },
  { symbol: 'MANAPPURAM', name: 'Manappuram Finance', sector: 'gold' },
  { symbol: 'KALYANFIN', name: 'Kalyan Jewellers', sector: 'gold' },
  { symbol: 'SENCO', name: 'Senco Gold', sector: 'gold' },
  // EV
  { symbol: 'OLECTRA', name: 'Olectra Greentech', sector: 'ev' },
  { symbol: 'EXIDEIND', name: 'Exide Industries', sector: 'ev' },
  { symbol: 'AMARAJABAT', name: 'Amara Raja Energy', sector: 'ev' },
  { symbol: 'KPITTECH', name: 'KPIT Technologies', sector: 'ev' },
  // Banking
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'banking' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'banking' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'banking' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'banking' },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'banking' },
  // IT
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'it' },
  { symbol: 'INFY', name: 'Infosys', sector: 'it' },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'it' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'it' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'it' },
  // Pharma
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'pharma' },
  { symbol: 'DRREDDY', name: "Dr. Reddy's Laboratories", sector: 'pharma' },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'pharma' },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'pharma' },
  // Defense
  { symbol: 'HAL', name: 'Hindustan Aeronautics', sector: 'defense' },
  { symbol: 'BEL', name: 'Bharat Electronics', sector: 'defense' },
  { symbol: 'BHEL', name: 'Bharat Heavy Electricals', sector: 'defense' },
  { symbol: 'MAZAGON', name: 'Mazagon Dock Shipbuilders', sector: 'defense' },
  // Metals
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'metals' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'metals' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries', sector: 'metals' },
  { symbol: 'VEDL', name: 'Vedanta', sector: 'metals' },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'metals' },
  // FMCG
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'fmcg' },
  { symbol: 'ITC', name: 'ITC Limited', sector: 'fmcg' },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'fmcg' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries', sector: 'fmcg' },
];

// Global regions and their impact on Indian sectors
export const GLOBAL_IMPACT_MAP: Record<string, { region: string; sectors: string[]; description: string }[]> = {
  'Middle East': [
    { region: 'Middle East', sectors: ['energy', 'gold', 'defense'], description: 'Oil supply disruption, safe-haven demand for gold, defense spending' },
  ],
  'USA': [
    { region: 'USA', sectors: ['it', 'pharma', 'banking'], description: 'Tech spending, FDA approvals, Fed rate impact on FII flows' },
  ],
  'China': [
    { region: 'China', sectors: ['metals', 'auto', 'ev'], description: 'Steel/commodity demand, EV battery supply, trade dynamics' },
  ],
  'Europe': [
    { region: 'Europe', sectors: ['auto', 'pharma', 'it'], description: 'Auto exports, pharma regulations, IT services demand' },
  ],
  'Russia-Ukraine': [
    { region: 'Russia-Ukraine', sectors: ['energy', 'metals', 'defense', 'gold'], description: 'Energy prices, commodity supply, geopolitical risk premium' },
  ],
};

export function getStockBySymbol(symbol: string) {
  return ALL_STOCKS.find(s => s.symbol.toLowerCase() === symbol.toLowerCase());
}

export function getStocksBySector(sectorId: string) {
  return ALL_STOCKS.filter(s => s.sector === sectorId);
}

export function searchStocks(query: string) {
  const q = query.toLowerCase();
  return ALL_STOCKS.filter(
    s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  ).slice(0, 10);
}
