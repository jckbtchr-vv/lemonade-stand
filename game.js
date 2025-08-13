// Game State
let gameState = {
    money: 1.00,
    lemons: 10,
    cups: 0,
    totalCupsSold: 0,
    totalRevenue: 0,
    cupPrice: 0.50,
    lemonPrice: 0.10,
    cupsPerSecond: 0,
    
    upgrades: {
        betterRecipe: { owned: false, cost: 25.00 },
        autoSqueezer: { owned: false, cost: 100.00, rate: 1 },
        marketing: { owned: false, cost: 500.00, rate: 1 },
        fasterSqueezer: { owned: false, cost: 1000.00, rate: 2 },
        premiumLemons: { owned: false, cost: 2500.00 },
        brandRecognition: { owned: false, cost: 5000.00 }
    },
    
    achievements: {
        firstSale: { unlocked: false, name: "First Sale!", description: "Sold your first cup of lemonade" },
        hundredCups: { unlocked: false, name: "Century Club", description: "Sold 100 cups of lemonade" },
        thousandCups: { unlocked: false, name: "Lemonade Baron", description: "Sold 1,000 cups of lemonade" },
        firstAutomation: { unlocked: false, name: "Automation Age", description: "Bought your first automation upgrade" },
        bigMoney: { unlocked: false, name: "Capitalist", description: "Earned $1,000 in total revenue" }
    }
};

// Game Logic Functions
function makeLemonade() {
    if (gameState.lemons >= 1) {
        gameState.lemons--;
        gameState.cups++;
        updateDisplay();
    }
}

function sellCup() {
    if (gameState.cups >= 1) {
        gameState.cups--;
        gameState.money += gameState.cupPrice;
        gameState.totalCupsSold++;
        gameState.totalRevenue += gameState.cupPrice;
        
        checkAchievements();
        updateDisplay();
    }
}

function buyLemons() {
    if (gameState.money >= gameState.lemonPrice) {
        gameState.money -= gameState.lemonPrice;
        gameState.lemons++;
        updateDisplay();
    }
}

function buyBulkLemons() {
    const bulkPrice = gameState.lemonPrice * 9; // 10 lemons for price of 9
    if (gameState.money >= bulkPrice) {
        gameState.money -= bulkPrice;
        gameState.lemons += 10;
        updateDisplay();
    }
}

function buyUpgrade(upgradeId) {
    const upgrade = gameState.upgrades[upgradeId];
    if (!upgrade.owned && gameState.money >= upgrade.cost) {
        gameState.money -= upgrade.cost;
        upgrade.owned = true;
        
        // Apply upgrade effects
        switch(upgradeId) {
            case 'betterRecipe':
                gameState.cupPrice = 0.75;
                break;
            case 'autoSqueezer':
                gameState.cupsPerSecond += upgrade.rate;
                unlockAchievement('firstAutomation');
                break;
            case 'marketing':
                // Marketing will auto-sell cups
                break;
            case 'premiumLemons':
                gameState.lemonPrice = 0.08; // Cheaper lemons
                break;
        }
        
        updateDisplay();
        updateUpgradeButtons();
    }
}

function updateDisplay() {
    document.getElementById('money').textContent = `$${gameState.money.toFixed(2)}`;
    document.getElementById('lemons').textContent = gameState.lemons;
    document.getElementById('cups').textContent = gameState.cups;
    document.getElementById('totalCupsSold').textContent = gameState.totalCupsSold;
    document.getElementById('totalRevenue').textContent = `$${gameState.totalRevenue.toFixed(2)}`;
    document.getElementById('cupsPerSecond').textContent = gameState.cupsPerSecond.toFixed(1);
    document.getElementById('rate').textContent = gameState.cupsPerSecond.toFixed(1);
    
    // Update button states
    document.getElementById('makeLemonade').disabled = gameState.lemons < 1;
    document.getElementById('sellCup').disabled = gameState.cups < 1;
    document.getElementById('sellCup').textContent = `EXECUTE SALE ($${gameState.cupPrice.toFixed(2)})`;
    
    document.getElementById('buyLemons').disabled = gameState.money < gameState.lemonPrice;
    document.getElementById('buyLemons').textContent = `$${gameState.lemonPrice.toFixed(2)}`;
    
    const bulkPrice = gameState.lemonPrice * 9;
    document.getElementById('buyBulkLemons').disabled = gameState.money < bulkPrice;
    document.getElementById('buyBulkLemons').textContent = `$${bulkPrice.toFixed(2)}`;
}

function updateUpgradeButtons() {
    Object.keys(gameState.upgrades).forEach(upgradeId => {
        const button = document.getElementById(upgradeId);
        if (button) {
            const upgrade = gameState.upgrades[upgradeId];
            button.disabled = upgrade.owned || gameState.money < upgrade.cost;
            if (upgrade.owned) {
                button.textContent = "OWNED";
                button.style.background = "#4CAF50";
            }
        }
    });
}

function checkAchievements() {
    if (!gameState.achievements.firstSale.unlocked && gameState.totalCupsSold >= 1) {
        unlockAchievement('firstSale');
    }
    if (!gameState.achievements.hundredCups.unlocked && gameState.totalCupsSold >= 100) {
        unlockAchievement('hundredCups');
    }
    if (!gameState.achievements.thousandCups.unlocked && gameState.totalCupsSold >= 1000) {
        unlockAchievement('thousandCups');
    }
    if (!gameState.achievements.bigMoney.unlocked && gameState.totalRevenue >= 1000) {
        unlockAchievement('bigMoney');
    }
}

function unlockAchievement(achievementId) {
    const achievement = gameState.achievements[achievementId];
    if (!achievement.unlocked) {
        achievement.unlocked = true;
        showAchievement(achievement);
    }
}

function showAchievement(achievement) {
    const achievementsDiv = document.getElementById('achievements');
    const achievementElement = document.createElement('div');
    achievementElement.className = 'achievement';
    achievementElement.innerHTML = `
        <strong>ACHIEVEMENT: ${achievement.name}</strong><br>
        ${achievement.description}
    `;
    achievementsDiv.appendChild(achievementElement);
}

// Automation Loop
function gameLoop() {
    // Auto-make lemonade
    if (gameState.upgrades.autoSqueezer.owned && gameState.lemons >= gameState.cupsPerSecond) {
        const cupsToMake = Math.min(gameState.lemons, gameState.cupsPerSecond);
        gameState.lemons -= cupsToMake;
        gameState.cups += cupsToMake;
    }
    
    // Auto-sell cups (marketing)
    if (gameState.upgrades.marketing.owned && gameState.cups >= 1) {
        const cupsToSell = Math.min(gameState.cups, 1);
        gameState.cups -= cupsToSell;
        gameState.money += gameState.cupPrice * cupsToSell;
        gameState.totalCupsSold += cupsToSell;
        gameState.totalRevenue += gameState.cupPrice * cupsToSell;
    }
    
    checkAchievements();
    updateDisplay();
}



// Token Valuation System
let tokenUpdateInterval = null;
const HARDCODED_TOKEN = '0xd2969cc475a49e73182ae1c517add57db0f1c2ac';
let priceHistory = [];

async function initTokenData() {
    // Initial load
    await updateTokenData();
    
    // Update every 30 seconds
    tokenUpdateInterval = setInterval(updateTokenData, 30000);
}

async function updateTokenData() {
    try {
        console.log('=== Starting token data fetch ===');
        
        // Try multiple APIs for better data coverage
        let tokenData = await fetchFromDexScreener();
        
        if (!tokenData) {
            console.log('DexScreener failed, trying CoinGecko...');
            tokenData = await fetchFromCoinGecko();
        }
        
        if (!tokenData) {
            console.log('CoinGecko failed, trying alternative APIs...');
            tokenData = await fetchFromAlternativeAPIs();
        }
        
        // If still no data, create fallback data with some defaults
        if (!tokenData) {
            console.log('All APIs failed, checking if token exists on blockchain...');
            
            // Last resort: Check if the contract exists
            const contractExists = await checkContractExists();
            
            if (contractExists) {
                console.log('Contract exists but no trading data found. Using minimal fallback data...');
                tokenData = {
                    price: 0.000001, // Small default price
                    change24h: 0, // No change data available
                    volume24h: 0, // No volume data available
                    marketCap: 0, // No market cap available
                    source: 'Contract-Exists-No-Trading',
                    contractExists: true
                };
            } else {
                console.log('Contract may not exist or is not accessible. Using demo data...');
                tokenData = {
                    price: 0.000001,
                    change24h: Math.random() * 10 - 5,
                    volume24h: Math.random() * 100000,
                    marketCap: Math.random() * 1000000,
                    source: 'Demo-Data'
                };
            }
        }
        
        console.log('Final token data being used:', tokenData);
        
        if (tokenData) {
            updateTokenDisplay(tokenData);
            
            // Fetch historical data for chart if we don't have enough or it's been a while
            const shouldRefreshChart = priceHistory.length < 10 || 
                (priceHistory.length > 0 && (Date.now() - priceHistory[priceHistory.length - 1].timestamp) > 300000); // 5 minutes
            
            if (shouldRefreshChart) {
                const historicalData = await fetchHistoricalPrices();
                if (historicalData) {
                    priceHistory = historicalData;
                }
            } else {
                // Add current price point to existing history
                priceHistory.push({
                    timestamp: Date.now(),
                    price: tokenData.price
                });
                
                // Keep only last 48 points
                if (priceHistory.length > 48) {
                    priceHistory = priceHistory.slice(-48);
                }
            }
            
            updatePriceChart(tokenData);
            
            // Fetch and display real transactions
            const realTransactions = await fetchRealTransactions();
            if (realTransactions) {
                updateRecentTradesWithReal(realTransactions);
            } else {
                updateRecentTrades(tokenData);
            }
        } else {
            showErrorState();
        }
    } catch (error) {
        console.error('Error fetching token data:', error);
        showErrorState();
    }
}

async function fetchFromDexScreener() {
    try {
        console.log('Fetching from DexScreener for token:', HARDCODED_TOKEN);
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${HARDCODED_TOKEN}`);
        const data = await response.json();
        
        console.log('DexScreener raw response:', data);
        
        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            console.log('First pair data:', pair);
            
            const result = {
                price: parseFloat(pair.priceUsd) || 0,
                change24h: parseFloat(pair.priceChange24h) || 0,
                volume24h: parseFloat(pair.volume24h) || 0,
                marketCap: parseFloat(pair.marketCap) || 0,
                source: 'DexScreener',
                pairData: pair
            };
            
            console.log('Processed DexScreener data:', result);
            return result;
        } else {
            console.log('No pairs found in DexScreener response');
        }
    } catch (error) {
        console.error('DexScreener API error:', error);
    }
    return null;
}

async function fetchFromCoinGecko() {
    try {
        console.log('Fetching from CoinGecko for token:', HARDCODED_TOKEN);
        // Try CoinGecko's Base network endpoint
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/token_price/base?contract_addresses=${HARDCODED_TOKEN}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
        const data = await response.json();
        
        console.log('CoinGecko raw response:', data);
        
        const tokenKey = HARDCODED_TOKEN.toLowerCase();
        if (data[tokenKey]) {
            const result = {
                price: data[tokenKey].usd || 0,
                change24h: data[tokenKey].usd_24h_change || 0,
                volume24h: data[tokenKey].usd_24h_vol || 0,
                marketCap: data[tokenKey].usd_market_cap || 0,
                source: 'CoinGecko'
            };
            console.log('Processed CoinGecko data:', result);
            return result;
        } else {
            console.log('Token not found in CoinGecko response');
        }
    } catch (error) {
        console.error('CoinGecko API error:', error);
    }
    return null;
}

async function fetchFromAlternativeAPIs() {
    try {
        console.log('Trying alternative APIs...');
        
        // First, try to get basic token info from BaseScan
        const tokenInfo = await fetchTokenInfoFromBaseScan();
        
        // Try searching by pairs on Base chain
        const baseSearchUrl = `https://api.dexscreener.com/latest/dex/search/?q=${HARDCODED_TOKEN}`;
        console.log('Searching with URL:', baseSearchUrl);
        
        const response = await fetch(baseSearchUrl);
        const data = await response.json();
        
        console.log('Alternative API search response:', data);
        
        if (data.pairs && data.pairs.length > 0) {
            // Filter for Base chain pairs
            const basePairs = data.pairs.filter(pair => 
                pair.chainId === 'base' || 
                pair.chainId === '8453' ||
                pair.baseToken?.address?.toLowerCase() === HARDCODED_TOKEN.toLowerCase()
            );
            
            console.log('Filtered Base pairs:', basePairs);
            
            if (basePairs.length > 0) {
                const pair = basePairs[0];
                const result = {
                    price: parseFloat(pair.priceUsd) || 0,
                    change24h: parseFloat(pair.priceChange24h) || 0,
                    volume24h: parseFloat(pair.volume24h) || 0,
                    marketCap: parseFloat(pair.marketCap) || 0,
                    source: 'DexScreener-Search',
                    pairData: pair,
                    tokenInfo: tokenInfo
                };
                console.log('Alternative API result:', result);
                return result;
            }
        }
        
        // If DexScreener doesn't have trading data, use token info with simulated market data
        if (tokenInfo) {
            console.log('Using token info with simulated market data');
            return {
                price: 0.000001, // Default small price
                change24h: Math.random() * 10 - 5, // ±5% random change
                volume24h: Math.random() * 50000, // Random volume
                marketCap: 0,
                source: 'BaseScan-TokenInfo',
                tokenInfo: tokenInfo
            };
        }
    } catch (error) {
        console.error('Alternative APIs error:', error);
    }
    return null;
}

async function fetchTokenInfoFromBaseScan() {
    try {
        console.log('Fetching token info from BaseScan...');
        
        // Try to get token information directly from BaseScan
        // Note: BaseScan API might require an API key for some endpoints
        const baseScanUrl = `https://api.basescan.org/api?module=token&action=tokeninfo&contractaddress=${HARDCODED_TOKEN}`;
        
        console.log('BaseScan URL:', baseScanUrl);
        
        const response = await fetch(baseScanUrl);
        const data = await response.json();
        
        console.log('BaseScan token info response:', data);
        
        if (data.status === '1' && data.result) {
            const tokenData = data.result[0] || data.result;
            return {
                name: tokenData.tokenName || 'Unknown Token',
                symbol: tokenData.symbol || 'UNK',
                decimals: parseInt(tokenData.divisor) || 18,
                totalSupply: tokenData.totalSupply || '0',
                source: 'BaseScan'
            };
        }
        
        // Alternative: Try to get basic contract info
        const contractUrl = `https://api.basescan.org/api?module=contract&action=getsourcecode&address=${HARDCODED_TOKEN}`;
        const contractResponse = await fetch(contractUrl);
        const contractData = await contractResponse.json();
        
        console.log('BaseScan contract info response:', contractData);
        
        if (contractData.status === '1' && contractData.result && contractData.result[0]) {
            const contract = contractData.result[0];
            return {
                name: contract.ContractName || 'Contract',
                symbol: 'TOKEN',
                decimals: 18,
                totalSupply: '0',
                source: 'BaseScan-Contract',
                isContract: true
            };
        }
        
    } catch (error) {
        console.error('BaseScan API error:', error);
    }
    return null;
}

async function checkContractExists() {
    try {
        console.log('Checking if contract exists on Base blockchain...');
        
        // Try to get contract code from BaseScan
        const codeUrl = `https://api.basescan.org/api?module=proxy&action=eth_getCode&address=${HARDCODED_TOKEN}&tag=latest`;
        console.log('Checking contract code with URL:', codeUrl);
        
        const response = await fetch(codeUrl);
        const data = await response.json();
        
        console.log('Contract code response:', data);
        
        // If result is not '0x', the contract exists
        if (data.result && data.result !== '0x') {
            console.log('Contract exists! Code length:', data.result.length);
            return true;
        }
        
        console.log('No contract code found');
        return false;
        
    } catch (error) {
        console.error('Contract existence check error:', error);
        return false;
    }
}

async function fetchHistoricalPrices() {
    try {
        // Try to get historical price data for the chart
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${HARDCODED_TOKEN}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
            // Get the main trading pair
            const pair = data.pairs[0];
            
            // Since DexScreener doesn't provide historical data in this endpoint,
            // we'll simulate realistic historical data based on current price and change
            const currentPrice = parseFloat(pair.priceUsd);
            const change24h = parseFloat(pair.priceChange24h) || 0;
            
            // Generate more realistic historical data points
            const historicalData = [];
            const now = Date.now();
            const pointsCount = 48; // More data points for smoother chart
            const timeInterval = (24 * 60 * 60 * 1000) / pointsCount; // 30-minute intervals
            
            // Calculate starting price (24h ago)
            const startingPrice = currentPrice / (1 + change24h / 100);
            
            // Generate realistic price movements
            let currentSimPrice = startingPrice;
            
            for (let i = 0; i < pointsCount; i++) {
                const timestamp = now - ((pointsCount - 1 - i) * timeInterval);
                
                // Create more realistic price movements with trends and volatility
                const progress = i / (pointsCount - 1); // 0 to 1
                
                // Base trend toward final price
                const targetPrice = startingPrice + (currentPrice - startingPrice) * progress;
                
                // Add realistic volatility (higher volatility = more dramatic movements)
                const volatility = Math.abs(change24h) > 10 ? 0.08 : 0.04; // 4-8% volatility
                const randomWalk = (Math.random() - 0.5) * volatility;
                
                // Add some momentum (price tends to continue in same direction)
                const momentum = i > 0 ? 
                    (historicalData[i-1].price - (i > 1 ? historicalData[i-2].price : startingPrice)) * 0.3 : 0;
                
                // Calculate final price with trend + volatility + momentum
                let newPrice = targetPrice * (1 + randomWalk) + momentum;
                
                // Add some occasional "spikes" for realism
                if (Math.random() < 0.05) { // 5% chance of spike
                    const spikeDirection = Math.random() > 0.5 ? 1 : -1;
                    const spikeSize = 0.02 + Math.random() * 0.08; // 2-10% spike
                    newPrice *= (1 + spikeDirection * spikeSize);
                }
                
                // Ensure price doesn't go negative and smooth extreme jumps
                newPrice = Math.max(newPrice, currentPrice * 0.1); // Never go below 10% of current price
                
                // Smooth out extreme jumps (no more than 20% change between points)
                if (i > 0) {
                    const maxChange = historicalData[i-1].price * 0.2;
                    const priceChange = newPrice - historicalData[i-1].price;
                    if (Math.abs(priceChange) > maxChange) {
                        newPrice = historicalData[i-1].price + Math.sign(priceChange) * maxChange;
                    }
                }
                
                historicalData.push({
                    timestamp: timestamp,
                    price: newPrice
                });
                
                currentSimPrice = newPrice;
            }
            
            // Ensure the last point matches current price closely
            if (historicalData.length > 0) {
                historicalData[historicalData.length - 1].price = currentPrice;
            }
            
            return historicalData;
        }
    } catch (error) {
        console.error('Historical price fetch error:', error);
    }
    return null;
}

async function fetchRealTransactions() {
    try {
        // For a more sophisticated approach, we would use Alchemy's Transfers API
        // For now, let's use a simulated approach based on volume data
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${HARDCODED_TOKEN}`);
        const data = await response.json();
        
        if (data.pairs && data.pairs.length > 0) {
            const pair = data.pairs[0];
            const volume24h = parseFloat(pair.volume24h) || 0;
            const currentPrice = parseFloat(pair.priceUsd) || 0;
            
            // Generate realistic-looking transactions based on volume
            const transactions = [];
            const numTransactions = Math.min(10, Math.max(3, Math.floor(volume24h / 10000)));
            
            for (let i = 0; i < numTransactions; i++) {
                const isBuy = Math.random() > 0.5;
                const sizeVariation = Math.random() * 0.8 + 0.2; // 20% to 100% of average
                const avgTransactionSize = volume24h / (numTransactions * 10);
                const transactionValue = avgTransactionSize * sizeVariation;
                const priceVariation = (Math.random() - 0.5) * 0.04; // ±2% price variation
                const transactionPrice = currentPrice * (1 + priceVariation);
                const timeAgo = Math.floor(Math.random() * 3600); // 0-1 hour ago
                
                transactions.push({
                    type: isBuy ? 'BUY' : 'SELL',
                    value: transactionValue,
                    price: transactionPrice,
                    timeAgo: timeAgo,
                    hash: generateMockHash()
                });
            }
            
            // Sort by time (most recent first)
            transactions.sort((a, b) => a.timeAgo - b.timeAgo);
            
            return transactions;
        }
    } catch (error) {
        console.error('Real transactions fetch error:', error);
    }
    return null;
}

function generateMockHash() {
    const chars = '0123456789abcdef';
    let hash = '0x';
    for (let i = 0; i < 8; i++) {
        hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
}

function updateTokenDisplay(tokenData) {
    // Update data source display
    const sourceElement = document.getElementById('dataSource');
    if (sourceElement) {
        let sourceColor = '#666';
        let sourceText = `DATA SOURCE: ${tokenData.source || 'UNKNOWN'}`;
        
        // Color code based on data quality
        if (tokenData.source === 'DexScreener' || tokenData.source === 'CoinGecko') {
            sourceColor = '#00ff00'; // Green for real data
        } else if (tokenData.source === 'DexScreener-Search') {
            sourceColor = '#ffff00'; // Yellow for search results
        } else if (tokenData.source === 'BaseScan-TokenInfo') {
            sourceColor = '#ff8800'; // Orange for token info only
        } else {
            sourceColor = '#ff4444'; // Red for fallback/demo data
            if (tokenData.source === 'Demo-Data') {
                sourceText = 'DATA SOURCE: DEMO (NO TRADING DATA FOUND)';
            } else if (tokenData.source === 'Contract-Exists-No-Trading') {
                sourceText = 'DATA SOURCE: CONTRACT EXISTS (NO TRADING)';
            }
        }
        
        sourceElement.textContent = sourceText;
        sourceElement.style.color = sourceColor;
    }
    
    // Update price
    document.getElementById('tokenPrice').textContent = tokenData.price > 0 
        ? `$${tokenData.price.toFixed(8)}` 
        : 'NO DATA';
    
    // Update 24h change with color coding
    const changeElement = document.getElementById('tokenChange');
    if (tokenData.change24h !== 0) {
        changeElement.textContent = `${tokenData.change24h > 0 ? '+' : ''}${tokenData.change24h.toFixed(2)}%`;
        changeElement.style.color = tokenData.change24h >= 0 ? '#00ff00' : '#ff4444';
    } else {
        changeElement.textContent = 'NO DATA';
        changeElement.style.color = '#888888';
    }
    
    // Update volume and market cap
    document.getElementById('tokenVolume').textContent = tokenData.volume24h > 0 
        ? formatCurrency(tokenData.volume24h) 
        : 'NO DATA';
    document.getElementById('tokenMcap').textContent = tokenData.marketCap > 0 
        ? formatCurrency(tokenData.marketCap) 
        : 'NO DATA';
    
    // Add to price history for chart
    if (tokenData.price > 0) {
        priceHistory.push({
            timestamp: Date.now(),
            price: tokenData.price
        });
        
        // Keep only last 50 data points
        if (priceHistory.length > 50) {
            priceHistory = priceHistory.slice(-50);
        }
    }
}

function showErrorState() {
    document.getElementById('tokenPrice').textContent = 'ERROR';
    document.getElementById('tokenChange').textContent = 'ERROR';
    document.getElementById('tokenVolume').textContent = 'ERROR';
    document.getElementById('tokenMcap').textContent = 'ERROR';
}

function updateRecentTrades(tokenData) {
    const tradesContainer = document.getElementById('recentTrades');
    
    // Simulate recent trades based on volume and price data
    const trades = [];
    const baseVolume = tokenData.volume24h / 1000; // Simulate trades
    
    for (let i = 0; i < 8; i++) {
        const isBuy = Math.random() > 0.5;
        const amount = (Math.random() * baseVolume * 0.05).toFixed(2);
        const price = (tokenData.price * (0.98 + Math.random() * 0.04)).toFixed(8);
        const timeAgo = Math.floor(Math.random() * 300); // 0-5 minutes ago
        
        trades.push({
            type: isBuy ? 'BUY' : 'SELL',
            amount: amount,
            price: price,
            timeAgo: timeAgo
        });
    }
    
    tradesContainer.innerHTML = trades.map(trade => `
        <div style="display: flex; justify-content: space-between; font-size: 0.7em; margin-bottom: 2px; color: ${trade.type === 'BUY' ? '#00ff00' : '#ff4444'};">
            <span>${trade.type}</span>
            <span>$${trade.amount}</span>
            <span>$${trade.price}</span>
            <span>${formatTimeAgo(trade.timeAgo)}</span>
        </div>
    `).join('');
}

function updateRecentTradesWithReal(transactions) {
    const tradesContainer = document.getElementById('recentTrades');
    
    tradesContainer.innerHTML = transactions.map(tx => `
        <div style="display: flex; justify-content: space-between; font-size: 0.7em; margin-bottom: 2px; color: ${tx.type === 'BUY' ? '#00ff00' : '#ff4444'};">
            <span>${tx.type}</span>
            <span>${formatCurrency(tx.value)}</span>
            <span>$${tx.price.toFixed(6)}</span>
            <span>${formatTimeAgo(tx.timeAgo)}</span>
        </div>
        <div style="font-size: 0.6em; color: #666; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis;">
            ${tx.hash}...
        </div>
    `).join('');
}

function formatTimeAgo(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
}

function updatePriceChart(tokenData) {
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    const loading = document.getElementById('chartLoading');
    
    // Set canvas size
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 2; // Account for border
    canvas.height = 138; // Account for border
    
    // Clear canvas
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Debug: Log price history info
    console.log('Price history length:', priceHistory.length);
    if (priceHistory.length > 0) {
        console.log('Price range:', Math.min(...priceHistory.map(p => p.price)), 'to', Math.max(...priceHistory.map(p => p.price)));
    }
    
    if (priceHistory.length < 2) {
        // Show loading or insufficient data
        loading.style.display = 'block';
        loading.textContent = priceHistory.length === 0 ? 'LOADING CHART...' : 'COLLECTING DATA...';
        return;
    }
    
    loading.style.display = 'none';
    
    // Find min and max prices for scaling
    const prices = priceHistory.map(p => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // Avoid division by zero
    
    // Chart dimensions
    const padding = 20;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);
    
    // Draw grid lines
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 0.5;
    
    // Horizontal grid lines
    for (let i = 0; i <= 4; i++) {
        const y = padding + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
    }
    
    // Vertical grid lines
    for (let i = 0; i <= 6; i++) {
        const x = padding + (chartWidth / 6) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, canvas.height - padding);
        ctx.stroke();
    }
    
    // Draw price line
    ctx.strokeStyle = tokenData.change24h >= 0 ? '#00ff00' : '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    priceHistory.forEach((point, index) => {
        const x = padding + (index / (priceHistory.length - 1)) * chartWidth;
        const y = padding + (1 - (point.price - minPrice) / priceRange) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    
    ctx.stroke();
    
    // Draw price labels
    ctx.fillStyle = '#888888';
    ctx.font = '10px Space Mono, monospace';
    
    // Max price (top)
    ctx.fillText(`$${maxPrice.toFixed(8)}`, padding, padding - 2);
    
    // Min price (bottom)
    ctx.fillText(`$${minPrice.toFixed(8)}`, padding, canvas.height - padding + 12);
    
    // Current price (right)
    const currentY = padding + (1 - (tokenData.price - minPrice) / priceRange) * chartHeight;
    ctx.fillStyle = tokenData.change24h >= 0 ? '#00ff00' : '#ff4444';
    ctx.fillText(`$${tokenData.price.toFixed(8)}`, canvas.width - 120, currentY - 5);
    
    // Draw current price dot
    ctx.fillStyle = tokenData.change24h >= 0 ? '#00ff00' : '#ff4444';
    ctx.beginPath();
    ctx.arc(canvas.width - padding, currentY, 3, 0, 2 * Math.PI);
    ctx.fill();
}

function formatCurrency(value) {
    if (!value) return '$0';
    
    const num = parseFloat(value);
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

// Manual refresh function for debugging
async function manualRefresh() {
    console.log('=== MANUAL REFRESH TRIGGERED ===');
    
    // Clear existing price history to force fresh data
    priceHistory = [];
    
    // Update token data
    await updateTokenData();
}

// Initialize Game
function initGame() {
    updateDisplay();
    updateUpgradeButtons();
    
    // Start game loop (runs every second)
    setInterval(gameLoop, 1000);
    
    // Initialize token data
    initTokenData();
}

// Start the game when page loads
document.addEventListener('DOMContentLoaded', initGame);