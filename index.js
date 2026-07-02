require('dotenv').config();

const axios = require('axios');
const http = require('http');
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
const CITY_LAT = process.env.CITY_LAT;
const CITY_LON = process.env.CITY_LON;

const subscribedChatIds = new Set([process.env.TELEGRAM_CHAT_ID]);

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Bot thời tiết đã khởi động...");

const commands = [
    { command: 'help', description: 'Hiển thị danh sách các lệnh' },
    { command: 'get', description: 'Nhận bản tin thời tiết ngay lập tức' },
    { command: 'add', description: 'Đăng ký nhận bản tin thời tiết hàng giờ' },
    { command: 'delete', description: 'Hủy đăng ký nhận bản tin' },
];

bot.setMyCommands(commands)
    .then(() => {
        console.log("Đã đăng ký các lệnh thành công với Telegram.");
    }).catch((error) => {
        console.error("Lỗi khi đăng ký lệnh:", error.message);
    });

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

async function sendWeatherUpdate(targetChatId = null) {
    console.log("Đang chuẩn bị gửi thông báo thời tiết...");
    const weather = await getWeather();

    if (weather) {
        const tempIcon = weather.temp >= 30 ? '🔥' : (weather.temp < 20 ? '❄️' : '☀️');
        const message = `
${tempIcon} *Cập nhật thời tiết TP.HCM* ${tempIcon}

🌡️ Nhiệt độ: *${Math.round(weather.temp)}°C*
-Cảm giác như: *${Math.round(weather.feels_like)}°C*
-Độ ẩm: *${weather.humidity}%*
-Trạng thái: *${weather.description}*

[${new Date().toLocaleString('vi-VN')}]
        `;

        try {
            if (targetChatId) {
                await bot.sendMessage(targetChatId, message, { parse_mode: 'Markdown' });
                console.log(`Gửi thông báo theo yêu cầu đến chat ID: ${targetChatId}`);
            } else {
                for (const chatId of subscribedChatIds) {
                    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                }
                if (subscribedChatIds.size > 0) {
                    console.log(`Gửi thông báo định kỳ thành công đến ${subscribedChatIds.size} cuộc trò chuyện!`);
                }
            }
        } catch (error) {
            console.error("Lỗi khi gửi tin nhắn Telegram:", error.message);
        }
    } else {
        console.log("Không có dữ liệu thời tiết để gửi.");
    }
}


cron.schedule('* * * * *', () => sendWeatherUpdate(), {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

const server = http.createServer((req, res) => {
    console.log(`[${new Date().toISOString()}] Nhận được yêu cầu ping. Bot vẫn hoạt động.`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Weather Bot is running.\n');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server đang lắng nghe tại cổng ${PORT}`);
    console.log("Gửi thông báo lần đầu để kiểm tra...");
    sendWeatherUpdate();
});


bot.on('polling_error', (error) => {
    console.error(`[LỖI POLLING]: ${error.code} - ${error.message}`);
});

bot.on('webhook_error', (error) => {
    console.error(`[LỖI WEBHOOK]: ${error.code} - ${error.message}`);
});

bot.on('error', (error) => {
    console.error('[LỖI CHUNG CỦA BOT]:', error);
});

bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
*DANH SÁCH LỆNH CỦA BOT THỜI TIẾT*

/help - Hiển thị danh sách các lệnh.
/get - Nhận bản tin thời tiết ngay lập tức.
/add (hoặc /subscribe) - Đăng ký nhận bản tin thời tiết hàng giờ.
/delete (hoặc /unsubscribe) - Hủy đăng ký nhận bản tin.
    `;
    try {
        await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`Lỗi khi gửi tin nhắn /help đến ${chatId}:`, error.message);
    }
});

bot.onText(/\/get/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await sendWeatherUpdate(chatId);
    } catch (error) {
        console.error(`Lỗi khi xử lý lệnh /get cho ${chatId}:`, error.message);
        await bot.sendMessage(chatId, " Rất tiếc, đã có lỗi xảy ra khi lấy dữ liệu thời tiết. Vui lòng thử lại sau.");
    }
});

bot.onText(/\/add|\/subscribe/, async (msg) => {
    const chatId = msg.chat.id;
    subscribedChatIds.add(String(chatId));
    await bot.sendMessage(chatId, "✅ Đã đăng ký nhận thông báo thời tiết thành công!");
    console.log(`Chat ID mới đã đăng ký: ${chatId}`);
});

bot.onText(/\/delete|\/unsubscribe/, async (msg) => {
    const chatId = msg.chat.id;
    subscribedChatIds.delete(String(chatId));
    await bot.sendMessage(chatId, "❌ Đã hủy đăng ký nhận thông báo.");
    console.log(`Chat ID đã hủy đăng ký: ${chatId}`);
});
