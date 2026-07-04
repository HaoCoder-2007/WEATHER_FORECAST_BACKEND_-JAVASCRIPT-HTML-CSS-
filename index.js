require('dotenv').config();

const express = require('express');
const app = express();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api').default;

const requiredEnvVars = [
    'OPENWEATHER_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'CITY_LAT',
    'CITY_LON',
    'SERVER_URL'
];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`Lỗi nghiêm trọng: Biến môi trường "${envVar}" chưa được thiết lập.`);
        process.exit(1);
    }
}

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CITY_LAT = process.env.CITY_LAT;
const CITY_LON = process.env.CITY_LON;

const SUBSCRIBERS_FILE = 'subscribers.json';

function saveSubscribers(chatIds) {
    try {
        fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(Array.from(chatIds)));
        console.log('Danh sách người dùng đã được lưu.');
    } catch (error) {
        console.error('Lỗi khi lưu danh sách người dùng:', error);
    }
}

function loadSubscribers() {
    try {
        if (fs.existsSync(SUBSCRIBERS_FILE)) {
            const data = fs.readFileSync(SUBSCRIBERS_FILE, 'utf8');
            const chatIds = data ? JSON.parse(data) : [];
            const subscriberSet = new Set(chatIds);
            subscriberSet.add(process.env.TELEGRAM_CHAT_ID);
            return subscriberSet;
        }
    } catch (error) {
        console.error('Lỗi khi tải danh sách người dùng:', error);
    }
    const initialSet = new Set([process.env.TELEGRAM_CHAT_ID]);
    saveSubscribers(initialSet);
    return initialSet;
}

const subscribedChatIds = loadSubscribers();

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

console.log("Bot thời tiết đã khởi động...");

const commands = [
    { command: 'help', description: 'Hiển thị danh sách các lệnh' },
    { command: 'get', description: 'Nhận bản tin thời tiết ngay lập tức' },
    { command: 'add', description: 'Đăng ký nhận bản tin thời tiết hàng giờ' },
    { command: 'delete', description: 'Hủy đăng ký nhận bản tin' },
];

const serverUrl = process.env.SERVER_URL;

bot.deleteWebHook()
    .then(() => {
        console.log("Đã xóa sạch cấu hình Webhook cũ. Sẵn sàng chạy Polling!");
    })
    .catch((error) => {
        console.log("Không thể xóa Webhook (có thể chưa từng cài đặt):", error.message);
    });

bot.setMyCommands(commands)
    .then(() => {
        console.log("Đã đăng ký các lệnh thành công với Telegram.");
    }).catch((error) => {
        console.error("Lỗi khi đăng ký lệnh:", error.message);
    });

async function getWeather() {
    const weatherApiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${CITY_LAT}&lon=${CITY_LON}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=vi`;

    try {
        const weatherResponse = await axios.get(weatherApiUrl);
        const weatherData = weatherResponse.data;

        return {
            temp: weatherData.main.temp,
            feels_like: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            description: weatherData.weather[0].description,
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

cron.schedule('0 * * * *', () => sendWeatherUpdate(), {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

app.get('/', (req, res) => {
    console.log(`[${new Date().toISOString()}] Nhận được yêu cầu ping. Bot vẫn hoạt động.`);
    res.send('Weather Bot is running.\n');
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
        await bot.sendMessage(chatId, "⚠️ Rất tiếc, đã có lỗi xảy ra khi lấy dữ liệu thời tiết. Vui lòng thử lại sau.");
    }
});

bot.onText(/\/add|\/subscribe/, async (msg) => {
    const chatId = String(msg.chat.id);
    if (subscribedChatIds.has(chatId)) {
        await bot.sendMessage(chatId, "Bạn đã đăng ký nhận thông báo rồi.");
    } else {
        subscribedChatIds.add(chatId);
        saveSubscribers(subscribedChatIds);
        await bot.sendMessage(chatId, "✅ Đã đăng ký nhận thông báo thời tiết thành công!");
        console.log(`Chat ID mới đã đăng ký: ${chatId}`);
    }
});

bot.onText(/\/delete|\/unsubscribe/, async (msg) => {
    const chatId = String(msg.chat.id);

    if (chatId === process.env.TELEGRAM_CHAT_ID) {
        await bot.sendMessage(chatId, "Bạn không thể hủy đăng ký cho tài khoản admin chính của bot.");
        return;
    }

    if (subscribedChatIds.has(chatId)) {
        subscribedChatIds.delete(chatId);
        saveSubscribers(subscribedChatIds);
        await bot.sendMessage(chatId, "❌ Đã hủy đăng ký nhận thông báo.");
        console.log(`Chat ID đã hủy đăng ký: ${chatId}`);
    } else {
        await bot.sendMessage(chatId, "Bạn chưa đăng ký nhận thông báo.");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Node.js đang chạy trên cổng ${PORT} (Sẵn sàng nhận kết nối nội bộ)`);
    console.log("Gửi thông báo lần đầu để kiểm tra...");
    sendWeatherUpdate();
});