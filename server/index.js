const express = require('express');
const cors = require('cors');
const { scrapeNOAAForecast } = require('./forecast');

const app = express();
app.use(cors());

// Add forecast endpoint
app.get('/api/forecast', async (req, res) => {
    try {
        const forecastData = await scrapeNOAAForecast();
        res.json(forecastData);
    } catch (error) {
        console.error('Error fetching forecast:', error);
        res.status(500).json({ error: 'Failed to fetch forecast data' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Forecast server running on port ${PORT}`);
}); 