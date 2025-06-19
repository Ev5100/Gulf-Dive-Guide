const axios = require('axios');

let lastFetchTime = null;
const REFRESH_INTERVAL = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

async function scrapeNOAAForecast() {
    try {
        // Check if we need to refresh the data
        const now = Date.now();
        if (lastFetchTime && (now - lastFetchTime) < REFRESH_INTERVAL) {
            console.log('Using cached forecast data - last fetch was less than 12 hours ago');
            return cachedForecastData;
        }

        console.log('Fetching new forecast data from NOAA...');
        const response = await axios.get('https://tgftp.nws.noaa.gov/data/forecasts/marine/offshore/gm/gmz040.txt');
        const text = response.data;
        
        // Parse the forecast data
        const forecastData = parseForecastText(text);
        
        // Cache the data
        lastFetchTime = now;
        cachedForecastData = {
            timestamp: new Date().toISOString(),
            rawText: forecastData.rawText,
            currentConditions: forecastData.currentConditions,
            forecast: forecastData.forecast
        };
        
        return cachedForecastData;
    } catch (error) {
        console.error('Error scraping NOAA forecast:', error);
        throw error;
    }
}

function parseForecastText(text) {
    const lines = text.split('\n');
    const forecast = [];
    let currentConditions = null;
    let rawText = '';

    // Find the relevant section for GMZ040
    let inTargetSection = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Check if we're in the GMZ040 section
        if (line.startsWith('GMZ040-')) {
            inTargetSection = true;
            rawText += line + '\n';
            continue;
        }
        // If we hit the next GMZ section, we're done
        if (inTargetSection && line.startsWith('GMZ') && !line.startsWith('GMZ040-')) {
            break;
        }
        if (inTargetSection) {
            rawText += line + '\n';
            // Look for lines like .TODAY...SE to S winds 15 to 20 kt. Seas 4 to 6 ft.
            const match = line.match(/^\.(TODAY|TONIGHT|[A-Z]{3}(?:\s+NIGHT)?)\.\.\.(.+)$/);
            if (match) {
                const date = match[1];
                const forecastText = match[2];
                const entry = {
                    date,
                    wind: extractWind(forecastText),
                    seas: extractSeas(forecastText),
                    weather: extractWeather(forecastText)
                };
                if (!currentConditions) {
                    currentConditions = {
                        wind: entry.wind,
                        seas: entry.seas,
                        weather: entry.weather
                    };
                }
                forecast.push(entry);
            }
        }
    }
    return {
        rawText: rawText.trim(),
        currentConditions,
        forecast
    };
}

function extractWind(line) {
    // Match examples: 'SE winds 15 to 20 kt', 'SE to S winds 15 to 20 kt', 'S winds 15 kt'
    const windMatch = line.match(/([A-Z]{1,3}(?:\s+to\s+[A-Z]{1,3})?)\s+winds?\s+(\d+(?:\s+to\s+\d+)?\s+kt)/i);
    if (windMatch) {
        // Combine direction(s) and speed(s)
        return `${windMatch[1]} winds ${windMatch[2]}`.replace(/\s+/g, ' ').trim();
    }
    return '';
}

function extractSeas(line) {
    const seasMatch = line.match(/(?:seas|Seas)\s+(\d+\s+to\s+\d+\s+ft|\d+\s+ft\s+or\s+less)/i);
    return seasMatch ? seasMatch[1].trim() : 'Unknown';
}

function extractWeather(line) {
    const weatherMatch = line.match(/\.\s*([A-Za-z\s]+)\./);
    return weatherMatch ? weatherMatch[1].trim() : null;
}

module.exports = {
    scrapeNOAAForecast
}; 