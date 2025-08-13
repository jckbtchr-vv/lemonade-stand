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
    document.getElementById('sellCup').textContent = `💰 Sell Cup ($${gameState.cupPrice.toFixed(2)})`;
    
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
        <strong>🏆 ${achievement.name}</strong><br>
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

// Save/Load System
function saveGame() {
    localStorage.setItem('lemonadeStandSave', JSON.stringify(gameState));
    alert('Game saved!');
}

function loadGame() {
    const saved = localStorage.getItem('lemonadeStandSave');
    if (saved) {
        gameState = JSON.parse(saved);
        updateDisplay();
        updateUpgradeButtons();
        
        // Restore achievements display
        Object.keys(gameState.achievements).forEach(achievementId => {
            const achievement = gameState.achievements[achievementId];
            if (achievement.unlocked) {
                showAchievement(achievement);
            }
        });
        
        alert('Game loaded!');
    } else {
        alert('No save file found!');
    }
}

function resetGame() {
    if (confirm('Are you sure you want to reset your progress? This cannot be undone!')) {
        localStorage.removeItem('lemonadeStandSave');
        location.reload();
    }
}

// Initialize Game
function initGame() {
    updateDisplay();
    updateUpgradeButtons();
    
    // Start game loop (runs every second)
    setInterval(gameLoop, 1000);
    
    // Auto-save every 30 seconds
    setInterval(saveGame, 30000);
    
    // Try to load saved game
    const saved = localStorage.getItem('lemonadeStandSave');
    if (saved) {
        const shouldLoad = confirm('Found a saved game. Would you like to continue where you left off?');
        if (shouldLoad) {
            loadGame();
        }
    }
}

// Start the game when page loads
document.addEventListener('DOMContentLoaded', initGame);