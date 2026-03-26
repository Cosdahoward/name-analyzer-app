import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 提供給外部喚醒服務的輕量級路由，防止 Render 免費版休眠
app.get('/ping', (req, res) => {
    res.status(200).send('pong');
});

// Load the Gemini API client
let ai;
try {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} catch (e) {
  console.error("Warning: GEMINI_API_KEY is not set correctly in .env");
}

let rulesText = "";

async function loadKnowledgeBase() {
    const dataDir = path.join(__dirname, 'data');
    let combinedText = "";
    try {
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir);
        }
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
            const filePath = path.join(dataDir, file);
            const ext = path.extname(file).toLowerCase();
            
            if (ext === '.txt') {
                console.log(`Loading knowledge from ${file}...`);
                const text = fs.readFileSync(filePath, 'utf8');
                combinedText += `\n--- 知識來源：${file} ---\n${text}\n`;
            } else if (ext === '.pdf') {
                console.log(`Loading knowledge from ${file}...`);
                const dataBuffer = fs.readFileSync(filePath);
                try {
                    const data = await pdfParse(dataBuffer);
                    combinedText += `\n--- 知識來源：${file} ---\n${data.text}\n`;
                } catch (e) {
                    console.error(`Failed to parse PDF ${file}:`, e.message);
                }
            } else if (ext === '.docx') {
                console.log(`Loading knowledge from ${file}...`);
                try {
                    const result = await mammoth.extractRawText({path: filePath});
                    combinedText += `\n--- 知識來源：${file} ---\n${result.value}\n`;
                } catch (e) {
                    console.error(`Failed to parse DOCX ${file}:`, e.message);
                }
            }
        }
        rulesText = combinedText;
        console.log("✅ 所有知識庫文本已成功載入合併完畢！共 " + rulesText.length + " 字。");
    } catch (err) {
        console.warn("載入知識庫時發生錯誤:", err);
    }
}

// 伺服器啟動時非同步載入
loadKnowledgeBase();

app.post('/api/analyze', async (req, res) => {
    const { name, gender, zodiac } = req.body;

    if (!name || !gender || !zodiac) {
        return res.status(400).json({ error: '姓名、性別與生肖皆為必填！' });
    }

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        return res.status(500).json({ error: '伺服器未設定 Gemini API 金鑰。請檢查 .env 檔案。' });
    }

    try {
        const prompt = `
你是一位嚴格遵循知識庫的「生肖姓名學專家」。
請根據以下我提供的「姓名學規則知識庫」為使用者進行姓名分析。
【極度重要】：絕不允許你自己搜尋外部資料，或加入坊間其他見解，你【只能依照我提供的知識庫內容】進行推論與判定，並給予總結與建議。如果知識庫中沒有相關說明，請誠實指出無法判斷，不要自行編造。

【最高指導原則】：
1. 你的「腦中思考邏輯」必須依照生肖喜忌優先、五行與陰陽邊為輔來推導。但在輸出內容時，【絕對禁止】把分析方法或名詞寫出來！不可以寫出「* 生肖喜忌：」、「* 五行：」、「* 陰陽邊：」等刻板的條列式標籤。請將推論結果直接融合為一段通順自然、優雅專業的評價散文。
2. 絕對不可出現「根據知識庫」、「依照文件」等字眼。請以專業命理大師的口吻直接斷定！

【姓名學規則知識庫】：
${rulesText}

【客戶資訊】：
姓名：${name}
性別：${gender}
生肖：${zodiac}

【請提供分析報告】：
請嚴格使用下方的「格式範本」進行輸出，不要有開場白或問候語。
每個欄位請直接給予一段流暢的分析評語（大約 80~150 字）。【嚴禁】把字根拆解的思考過程編成清單。務必考量男女有別的禁忌。

---
**全名**：${name}
**性別**：${gender}
**生肖**：${zodiac}

**1. 事業財運：**
(以大師口吻，直接寫出流暢的事業與財運評語。絕對不要寫出分析方法或子標題)

**2. 人際感情：**
(直接寫出流暢的人際與感情婚姻評語。絕對不要寫出分析方法或子標題)

**3. 身體狀況：**
(直接寫出流暢的健康提醒與應注意的病兆。絕對不要寫出分析方法或子標題)

**4. 整體評分：**
(給予一個明確的 0~100 分綜合評分，並提供一句話的最終開運指導)
`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "你是一個嚴格遵循提供文檔的生肖姓名學大師。",
                temperature: 0.7,
            }
        });

        if (response && response.text) {
            res.json({ analysis: response.text });
        } else {
            throw new Error('API 回傳格式錯誤或沒有回應');
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: '分析過程中發生錯誤，請稍後再試或者檢查 API 金鑰。' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
