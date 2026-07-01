const axios = require('axios');
const { default: TelegramBot } = require('node-telegram-bot-api');

export default async function handler(req, res) {
    const {
        OPENWEATHER_API_KEY,
        TELEGRAM_BOT_TOKEN,
        TELEGRAM_CHAT_ID,
        CITY_LAT,
        CITY_LON
    } = process.env;

    const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

    console.log("Cron job triggered: Fetching and sending weather update...");

    try {
        const weatherApiUrl = `<https://api.openweathermap.org/data/2.5/weather?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi>`;
        const uvApiUrl = `<https://api.openweathermap.org/data/2.5/uvi?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}>`;

        const [weatherResponse, uvResponse] = await Promise.all([
            axios.get(weatherApiUrl),
            axios.get(uvApiUrl)
        ]);

        const weatherData = weatherResponse.data;
        const uvData = uvResponse.data;

        const weather = {
            temp: weatherData.main.temp,
            feels_like: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            description: weatherData.weather[0].description,
            uvi: uvData.value,
        };

        const tempIcon = weather.temp >= 30 ? '🔥' : (weather.temp < 20 ? '❄️' : '☀️');
        const uvIcon = weather.uvi >= 8 ? '🔴' : (weather.uvi >= 3 ? '🟠' : '🟢');

        const message = `
        ${tempIcon} Cập nhật thời tiết TP.HCM ${tempIcon}
        -Nhiệt độ: ${Math.round(weather.temp)}°C 
        -Cảm giác như: ${Math.round(weather.feels_like)}°C 
        -Độ ẩm: ${weather.humidity}% 
        -Trạng thái: ${weather.description} 
        -Chỉ số UV: ${weather.uvi} `;
                
        await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        console.log("Successfully sent weather update.");

        res.status(200).send('Weather update sent successfully.');

    } catch (error) {
        console.error("Error in cron job:", error.message);
        res.status(500).send(`Error sending weather update: ${error.message}`);
    }
}