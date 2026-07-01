require('dotenv').config();

const axios = require('axios');
const { default: TelegramBot } = require('node-telegram-bot-api');
const cron = require('node-cron');

const requiredEnvVars = [
    'OPENWEATHER_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'CITY_LAT',
    'CITY_LON'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Lỗi nghiêm trọng: Biến môi trường "${envVar}" chưa được thiết lập. Vui lòng kiểm tra tệp .env hoặc cài đặt trên máy chủ.`);
        process.exit(1);
    }
}

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

console.log("Bot thời tiết đã khởi động...");

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

async function sendWeatherUpdate() {
    console.log("Đang chuẩn bị gửi thông báo thời tiết...");
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

        try {
            await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
            console.log("Gửi thông báo thành công!");
        } catch (error) {
            console.error("Lỗi khi gửi tin nhắn Telegram:", error.message);
        }
    } else {
        console.log("Không có dữ liệu thời tiết để gửi.");
    }
}

cron.schedule('0 * * * *', sendWeatherUpdate, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

console.log("Gửi thông báo lần đầu để kiểm tra...");
sendWeatherUpdate();
