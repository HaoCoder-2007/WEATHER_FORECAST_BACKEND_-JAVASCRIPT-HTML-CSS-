const axios = require('axios');
const { default: TelegramBot } = require('node-telegram-bot-api');

const {
    OPENWEATHER_API_KEY,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    CITY_LAT,
    CITY_LON
} = process.env;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

async function getWeather() {
    const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`;
    const uvApiUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}`;

    const [weatherResponse, uvResponse] = await Promise.all([
        axios.get(weatherApiUrl),
        axios.get(uvApiUrl)
    ]);

    const weatherData = weatherResponse.data;
    const uvData = uvResponse.data;

    return {
        temp: weatherData.main.temp,
        feels_like: weatherData.main.feels_like,
        humidity: weatherData.main.humidity,
        description: weatherData.weather[0].description,
        uvi: uvData.value,
    };
}

/**
@param {import('next').NextApiResponse} res
 */
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    console.log("API endpoint triggered...");

    try {
        const weather = await getWeather();

        const tempIcon = weather.temp >= 30 ? '🔥' : (weather.temp < 20 ? '❄️' : '☀️');
        const uvIcon = weather.uvi >= 8 ? '🔴' : (weather.uvi >= 3 ? '🟠' : '🟢');

        const message = `
${tempIcon} *Cập nhật thời tiết TP.HCM* ${tempIcon}

🌡️ Nhiệt độ: *${Math.round(weather.temp)}°C*
🤔 Cảm giác như: *${Math.round(weather.feels_like)}°C*
💧 Độ ẩm: *${weather.humidity}%*
📝 Trạng thái: *${weather.description}*
${uvIcon} Chỉ số UV: *${weather.uvi}*
        `;
                
        if (req.headers['user-agent'].includes('github-actions')) {
            console.log("Sending notification to Telegram...");
            await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }

        res.status(200).json(weather);

    } catch (error) {
        console.error("Error in cron job:", error.message);
        res.status(500).json({ error: `Error sending weather update: ${error.message}` });
    }
}