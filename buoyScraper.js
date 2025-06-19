const axios = require('axios');

class BuoyScraper {
    constructor(buoyId = '42019') {
        this.buoyId = buoyId;
        this.baseUrl = 'https://www.ndbc.noaa.gov/data/realtime2';
        this.lastFetchTime = null;
        this.refreshInterval = 60 * 60 * 1000; // 1 hour in milliseconds
    }

    async fetchBuoyData() {
        try {
            // Check if we need to refresh the data
            const now = Date.now();
            if (this.lastFetchTime && (now - this.lastFetchTime) < this.refreshInterval) {
                console.log('Using cached data - last fetch was less than an hour ago');
                return this.cachedData;
            }

            console.log('Fetching new data from NOAA...');
            const url = `${this.baseUrl}/${this.buoyId}.txt`;
            console.log('Request URL:', url);
            
            const response = await axios.get(url);
            
            if (!response.data) {
                console.error('No data received from NOAA response');
                throw new Error('No data received from NOAA');
            }

            console.log('Received raw data from NOAA:', response.data.substring(0, 200) + '...');
            
            const parsedData = this.parseBuoyData(response.data);
            
            if (!parsedData || !parsedData.latest) {
                console.error('Failed to parse NOAA data:', parsedData);
                throw new Error('Failed to parse NOAA data');
            }

            console.log('Successfully parsed data:', {
                timestamp: parsedData.latest.timestamp,
                waveHeight: parsedData.latest.waveHeight,
                windSpeed: parsedData.latest.windSpeed
            });

            this.cachedData = parsedData;
            this.lastFetchTime = now;
            
            return parsedData;
        } catch (error) {
            console.error('Error fetching buoy data:', error.message);
            if (error.response) {
                console.error('NOAA API response:', {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    headers: error.response.headers
                });
            }
            // If we have cached data, return it even if it's stale
            if (this.cachedData) {
                console.log('Returning cached data due to fetch error');
                return this.cachedData;
            }
            throw error;
        }
    }

    parseBuoyData(rawData) {
        try {
            console.log('Starting to parse buoy data...');
            
            // Split the data into lines and remove empty lines
            const lines = rawData.split('\n').filter(line => line.trim());
            console.log(`Found ${lines.length} lines in raw data`);
            
            // Find the data header line (contains column names)
            const headerIndex = lines.findIndex(line => line.includes('#YY'));
            if (headerIndex === -1) {
                console.error('Could not find data header in NOAA response. First few lines:', lines.slice(0, 5));
                throw new Error('Could not find data header in NOAA response');
            }
            console.log('Found header at line:', headerIndex);

            // Get the data lines after the header
            const dataLines = lines.slice(headerIndex + 1);
            console.log(`Found ${dataLines.length} data lines after header`);
            
            // Parse all data lines
            const parsedLines = dataLines
                .map(line => this.parseDataLine(line))
                .filter(data => data !== null && data.timestamp !== null);

            console.log(`Successfully parsed ${parsedLines.length} valid data lines`);

            if (parsedLines.length === 0) {
                console.error('No valid data points found in NOAA response');
                throw new Error('No valid data points found in NOAA response');
            }

            // Find the most recent valid data for each measurement
            const latestData = {
                timestamp: parsedLines[0].timestamp,
                windDirection: this.findMostRecentValid(parsedLines, 'windDirection'),
                windSpeed: this.findMostRecentValid(parsedLines, 'windSpeed'),
                waveHeight: this.findMostRecentValid(parsedLines, 'waveHeight'),
                dominantWavePeriod: this.findMostRecentValid(parsedLines, 'dominantWavePeriod'),
                airTemperature: this.findMostRecentValid(parsedLines, 'airTemperature'),
                waterTemperature: this.findMostRecentValid(parsedLines, 'waterTemperature')
            };

            // Get the last 12 data points for historical charting (2 hours at 10-min intervals)
            const historicalData = parsedLines
                .slice(Math.max(0, parsedLines.length - 12))
                .map(data => ({
                    timestamp: data.timestamp,
                    windDirection: data.windDirection,
                    windSpeed: data.windSpeed,
                    waveHeight: data.waveHeight,
                    dominantWavePeriod: data.dominantWavePeriod,
                    airTemperature: data.airTemperature,
                    waterTemperature: data.waterTemperature
                }));

            // Calculate condition score
            const conditionScore = this.calculateConditionScore(latestData);

            // Ensure we have a valid timestamp
            const lastUpdated = new Date().toISOString();
            if (!latestData.timestamp) {
                console.warn('No valid timestamp in latest data, using current time');
                latestData.timestamp = lastUpdated;
            }

            return {
                latest: latestData,
                historical: historicalData,
                conditionScore: conditionScore,
                lastUpdated: lastUpdated
            };
        } catch (error) {
            console.error('Error parsing buoy data:', error.message);
            throw error;
        }
    }

    parseDataLine(line) {
        try {
            // Split the line into columns and filter out empty strings
            const columns = line.split(/\s+/).filter(col => col.trim());
            
            // Ensure we have enough columns
            if (columns.length < 15) {
                console.warn('Invalid data line format:', line);
                return null;
            }

            // Parse each value with proper error handling
            return {
                timestamp: this.parseTimestamp(columns[0], columns[1], columns[2], columns[3], columns[4]),
                windDirection: this.parseWindDirection(columns[5]),
                windSpeed: this.parseFloat(columns[6]),
                gustSpeed: this.parseFloat(columns[7]),
                waveHeight: this.parseFloat(columns[8]),
                dominantWavePeriod: this.parseFloat(columns[9]),
                averageWavePeriod: this.parseFloat(columns[10]),
                meanWaveDirection: this.parseFloat(columns[11]),
                pressure: this.parseFloat(columns[12]),
                airTemperature: this.parseFloat(columns[13]),
                waterTemperature: this.parseFloat(columns[14]),
                dewPoint: this.parseFloat(columns[15] || 'MM'),
                visibility: this.parseFloat(columns[16] || 'MM'),
                pressureTendency: this.parseFloat(columns[17] || 'MM'),
                tide: this.parseFloat(columns[18] || 'MM')
            };
        } catch (error) {
            console.warn('Error parsing data line:', error.message);
            return null;
        }
    }

    parseFloat(value) {
        // Handle NOAA's 'MM' (missing) values
        if (value === 'MM' || value === undefined) {
            return null;
        }
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
    }

    parseTimestamp(year, month, day, hour, minute) {
        try {
            // Validate input values
            if (!year || !month || !day || !hour || !minute) {
                console.warn('Missing timestamp components:', { year, month, day, hour, minute });
                return null;
            }

            // Convert to ISO string format. Month is 0-indexed in Date constructor.
            const date = new Date(Date.UTC(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute)
            ));
            
            if (isNaN(date.getTime())) {
                console.warn('Invalid date created from components:', { year, month, day, hour, minute });
                return null;
            }
            
            return date.toISOString();
        } catch (error) {
            console.warn('Error parsing timestamp:', error.message);
            return null;
        }
    }

    parseWindDirection(directionString) {
        try {
            // First try to parse as a number
            const numericDirection = parseFloat(directionString);
            if (!isNaN(numericDirection)) {
                return numericDirection;
            }

            // If not a number, try to convert from cardinal direction
            const directionMap = {
                'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
                'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
                'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
                'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
            };

            const direction = directionMap[directionString.toUpperCase()];
            if (direction !== undefined) {
                return direction;
            }

            // If we can't parse it, return null
            return null;
        } catch (error) {
            console.warn('Error parsing wind direction:', error.message);
            return null;
        }
    }

    normalizeValue(value, min, max) {
        if (value === null || isNaN(value) || min === max) {
            return 0.5; // Handle invalid/edge cases
        }
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }

    calculateConditionScore(data) {
        try {
            // Define reasonable max values for normalization
            const maxWaveHeight = 5; // meters (approx 16-17 feet, high waves)
            const maxWindSpeed = 25; // m/s (approx 48 knots, strong winds)

            // Handle null values by using default values
            const waveHeight = data.waveHeight ?? 0;
            const windSpeed = data.windSpeed ?? 0;

            const normalizedWaveHeight = this.normalizeValue(waveHeight, 0, maxWaveHeight);
            const normalizedWindSpeed = this.normalizeValue(windSpeed, 0, maxWindSpeed);

            // Calculate the "badness" score (0 = perfect conditions, 1 = worst conditions)
            const waveScore = normalizedWaveHeight;
            const windScore = normalizedWindSpeed;
            const averageBadness = (waveScore + windScore) / 2;

            // Convert to percentage (0% = perfect conditions, 100% = worst conditions)
            return Math.round(averageBadness * 100);
        } catch (error) {
            console.warn('Error calculating condition score:', error.message);
            return 50; // Return middle value on error
        }
    }

    findMostRecentValid(dataLines, field) {
        // Find the first non-null value for the given field
        const validData = dataLines.find(line => line[field] !== null);
        return validData ? validData[field] : null;
    }

    // Method to start automatic refresh
    startAutoRefresh(callback) {
        // Initial fetch
        this.fetchBuoyData().then(callback).catch(console.error);

        // Set up interval for subsequent fetches
        setInterval(() => {
            this.fetchBuoyData().then(callback).catch(console.error);
        }, this.refreshInterval);
    }
}

// Example usage
async function main() {
    const scraper = new BuoyScraper();
    try {
        const data = await scraper.fetchBuoyData();
        console.log('Latest Buoy Data:', JSON.stringify(data.latest, null, 2));
        console.log('Historical Buoy Data (last 12 readings):', JSON.stringify(data.historical, null, 2));
        console.log('Condition Score:', data.conditionScore);
    } catch (error) {
        console.error('Failed to fetch buoy data:', error.message);
    }
}

// Run the example if this file is executed directly
if (require.main === module) {
    main();
}

module.exports = BuoyScraper; 