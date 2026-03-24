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
【最高指導原則】：在輸出的報告中，絕對不可以出現「根據知識庫」、「知識庫指出」、「依照文件」等類似的字眼。請內化這些知識後，以專業命理大師的口吻直接給出結論！

【姓名學規則知識庫】：
${rulesText}

【客戶資訊】：
姓名：${name}
性別：${gender}
生肖：${zodiac}

【請提供分析報告】：
請嚴格使用下方的「格式」進行輸出，不要增加任何額外的開場白或問候語（不要說你好），也不要隨意改變欄位名稱。
針對每個欄位，請引述字面上（例如字根、五行、喜忌、三合、六沖等）來作答。注意不能帶有「根據知識庫」等字眼。如果該名字對該領域沒有明顯好壞，可以寫「一生平穩」或「無特別刑忌」。請務必考量男女有別的禁忌（如女性忌用某些男性字）。

---
**全名**：${name}
**性別**：${gender}
**生肖**：${zodiac}

**人際關係：**
(依據您的知識庫分析字根對人際的影響)

**婚姻感情：**
(依據分析...)

**工作事業：**
(依據分析...)

**身體健康：**
(重點注意是否有正沖或其他傷疤疾病影響...)

**財運部分：**
(例如賺錢積極度、財庫是否破洞...)

**整體而言：**
(總結前面各項重點)

**建議：**
(根據上述知識庫總結，給予具體的流年或開運建議)
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
