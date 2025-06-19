const express = require('express');
const cors = require('cors');
const path = require('path');
const BuoyScraper = require('./buoyScraper');
const { scrapeNOAAForecast } = require('./server/forecast');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create BuoyScraper instance
const buoyScraper = new BuoyScraper('42019');

// API endpoint to get buoy data
app.get('/api/buoy-data', async (req, res) => {
    try {
        console.log('Fetching buoy data...');
        const data = await buoyScraper.fetchBuoyData();
        
        if (!data || !data.latest) {
            console.error('Invalid data received from scraper:', data);
            return res.status(500).json({ 
                error: 'Invalid data received from NOAA',
                details: 'The scraper returned invalid or empty data'
            });
        }

        console.log('Successfully fetched buoy data:', {
            timestamp: data.latest.timestamp,
            waveHeight: data.latest.waveHeight,
            windSpeed: data.latest.windSpeed
        });

        console.log('Timestamp from scraper (before sending to client):', data.latest.timestamp);

        res.json(data);
    } catch (error) {
        console.error('Error in /api/buoy-data endpoint:', error);
        res.status(500).json({ 
            error: 'Failed to fetch buoy data',
            details: error.message
        });
    }
});

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

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        details: err.message
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    
    // Start automatic refresh
    buoyScraper.startAutoRefresh((data) => {
        console.log('Data refreshed at:', new Date().toISOString());
        if (data && data.latest) {
            console.log('Latest data:', {
                timestamp: data.latest.timestamp,
                waveHeight: data.latest.waveHeight,
                windSpeed: data.latest.windSpeed
            });
        } else {
            console.warn('No valid data received in auto-refresh');
        }
    });
}); 