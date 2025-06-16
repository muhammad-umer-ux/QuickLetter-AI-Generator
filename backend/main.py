# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from google.generativeai.types import HarmCategory, HarmBlockThreshold
import google.generativeai as genai
import os

# FastAPI ایپلیکیشن انسٹینس بنائیں
app = FastAPI()

# CORS مڈل ویئر شامل کریں
# یہ کسی بھی ڈومین سے آنے والی ریکویسٹس کو اجازت دے گا (محتاط رہیں پروڈکشن میں)
# عام طور پر، آپ کو یہاں صرف اپنے فرنٹ اینڈ کا ڈومین شامل کرنا چاہیے
origins = [
    "https://quickletter-ai-frontend.onrender.com",    # آپ کے Render فرنٹ اینڈ کا URL
    "https://quickletter-ai-generator.web.app",        # !!! یہ نئی لائن شامل کی گئی ہے - Firebase Hosting URL !!!
    "http://localhost:3000",                           # اگر آپ لوکل پر ٹیسٹ کر رہے ہیں
    "http://127.0.0.1:3000",                           # اگر آپ لوکل پر ٹیسٹ کر رہے ہیں
    # مزید اوریجنز شامل کر سکتے ہیں اگر ضرورت ہو
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],    # تمام HTTP methods کی اجازت دیں (GET, POST, etc.)
    allow_headers=["*"],    # تمام headers کی اجازت دیں
)

# ان پٹ پراڈکٹ کے لیے Pydantic ماڈل
class PromptRequest(BaseModel):
    prompt: str

# Gemini API کو انیشلائز کریں (API_KEY انوائرمنٹ ویری ایبل سے لے گا)
# یقینی بنائیں کہ آپ نے Render پر GOOGLE_API_KEY کا Environment Variable سیٹ کیا ہے
genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

# جنریشن کانفیگریشن
generation_config = {
    "candidate_count": 1,
    "max_output_tokens": 1024,
    "temperature": 0.7,
    "top_p": 1,
    "top_k": 1,
}

# حفاظتی سیٹنگز
safety_settings = [
    {"category": HarmCategory.HARM_CATEGORY_HARASSMENT, "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE},
    {"category": HarmCategory.HARM_CATEGORY_HATE_SPEECH, "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE},
    {"category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE},
    {"category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE},
]

# Gemini ماڈل کو لوڈ کریں
model = genai.GenerativeModel(
    model_name="gemini-2.0-flash",
    generation_config=generation_config,
    safety_settings=safety_settings
)

@app.get("/")
async def read_root():
    return {"message": "Welcome to QuickLetter AI Backend!"}

@app.post("/generate-text")
async def generate_text_api(request: PromptRequest):
    try:
        # Gemini API کو کال کریں
        response = model.generate_content(request.prompt)

        # جواب کو پروسیس کریں
        if response.candidates:
            return {"candidates": [candidate.to_dict() for candidate in response.candidates]}
        else:
            # اگر کوئی کینڈیڈیٹس نہیں ملے تو خالی جواب یا ایرر بھیجیں
            return {"candidates": []}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
