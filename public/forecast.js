// Function to fetch and parse NOAA forecast data
async function fetchForecastData() {
    try {
        const response = await fetch('/api/forecast');
        const data = await response.json();
        
        // Update the forecast display
        const forecastContainer = document.getElementById('forecastData');
        if (!forecastContainer) return;
        
        // Create HTML for the forecast
        let html = `
            <div class=\"forecast-scroll\" style=\"overflow-y: auto; max-height: 525px; width: 100%; display: flex; flex-direction: column; gap: 12px; box-sizing: border-box; position: relative; border: 2px solid #00ffff; border-radius: 10px; box-shadow: 0 4px 16px rgba(0,255,255,0.08); background: rgba(45,55,72,0.85);\">
                ${Array.isArray(data.forecast) ? data.forecast.map(entry => {
                    // Clean up wind and seas fields
                    const wind = (!entry.wind || entry.wind.trim().toLowerCase() === 'unknown') ? '--' : entry.wind;
                    const seas = (!entry.seas || entry.seas.trim().toLowerCase() === 'unknown') ? '--' : entry.seas;
                    return `
                        <div class=\"forecast-mini-card\" style=\"width: 100%; min-width: 0; background: #101c2c; border-radius: 8px; padding: 12px; box-sizing: border-box; border-bottom: 2px solid #00ffff;\">
                            <div class=\"data-label\" style=\"font-size: 1rem; font-weight: bold; margin-bottom: 4px;\">${entry.date || '--'}</div>
                            <div class=\"data-value\" style=\"font-size: 0.95rem;\">${wind}</div>
                            <div class=\"data-value\" style=\"font-size: 0.95rem;\">${seas}</div>
                            ${entry.weather ? `<div class=\"data-value\" style=\"font-size: 0.9rem; color: #7dd3fc;\">${entry.weather}</div>` : ''}
                        </div>
                    `;
                }).join('') : '<div>No forecast data available</div>'}
                <div style=\"position: absolute; left: 0; right: 0; bottom: 0; height: 40px; pointer-events: none; background: linear-gradient(to bottom, rgba(45,55,72,0) 0%, #2d3748 100%); border-radius: 0 0 8px 8px;\"></div>
            </div>
        `;
        
        forecastContainer.innerHTML = html;
    } catch (error) {
        console.error('Error fetching forecast:', error);
        const forecastContainer = document.getElementById('forecastData');
        if (forecastContainer) {
            forecastContainer.innerHTML = '<div class="text-red-500">Error loading forecast data</div>';
        }
    }
}

// Initial fetch
document.addEventListener('DOMContentLoaded', fetchForecastData);

// Refresh forecast every 12 hours
setInterval(fetchForecastData, 12 * 60 * 60 * 1000);