const axios = require('axios');
const { default: TelegramBot } = require('node-telegram-bot-api');

const {
    OPENWEATHER_API_KEY,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    CITY_LAT,
    CITY_LON
} = process.env;

const bot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

async function getWeather() {
    const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`;
    const uvApiUrl = `https://api.openweathermap.org/data/2.5/uvi?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}`;

    try {
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
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu thời tiết:", error.message);
        return null;
    }
}

export default async function handler(req, res) {
    if (!bot || !OPENWEATHER_API_KEY || !TELEGRAM_CHAT_ID) {
        const errorMessage = "Lỗi: Thiếu các biến môi trường quan trọng trên Vercel.";
        console.error(errorMessage);
        return res.status(500).json({ error: errorMessage });
    }

    console.log("Cron job được kích hoạt từ GitHub Actions...");

    try {
        const weather = await getWeather();

        if (weather) {
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

            await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });

            console.log("Gửi thông báo thành công!");
            return res.status(200).json({ status: "success", message: "Notification sent." });

        } else {
            console.log("Không có dữ liệu thời tiết để gửi.");
            return res.status(500).json({ status: "error", message: "Could not fetch weather data." });
        }
    } catch (error) {
        console.error("Lỗi trong handler (có thể từ getWeather hoặc sendMessage):", error.message);
        return res.status(500).json({ status: "error", message: error.message });
    }
}