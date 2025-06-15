# QuickLetter_Project/backend/main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai
import os
import logging
from dotenv import load_dotenv # .env file se variables load karne ke liye

# .env file se environment variables load karein
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Environment variable se Gemini API key load karein
# Ensure your .env file in the backend folder has: GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
gemini_api_key = os.getenv("GEMINI_API_KEY")

# Agar GEMINI_API_KEY environment variable set nahi hai, toh error dein
if not gemini_api_key or gemini_api_key == "YOUR_GEMINI_API_KEY_HERE": # Check for placeholder too
    logger.error("GEMINI_API_KEY environment variable not set or is a placeholder. Please set it correctly in your .env file.")
    # Agar key nahi milti to app ko start hone se roken ya koi aur appropriate action len
    raise RuntimeError("GEMINI_API_KEY is not set or is invalid. Cannot initialize AI model. Please check your .env file.")

# Gemini API ko configure karein
genai.configure(api_key=gemini_api_key)

# Gemini model ko initialize karein
model = genai.GenerativeModel('gemini-2.0-flash')

app = FastAPI()

# CORS (Cross-Origin Resource Sharing) middleware ko enable karein
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://quickletter-ai-generator.web.app"],  # React app aur live app ka URL allow karein
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request body ke liye Pydantic model (letter generation ke liye)
class LetterRequest(BaseModel):
    category: str
    language: str
    description: str

# Email generation ke liye Request body ka Pydantic model
class EmailRequest(BaseModel):
    category: str
    language: str
    description: str

# Sample description generation ke liye Request body ka Pydantic model
class SampleDescriptionRequest(BaseModel):
    category: str
    language: str

# Root endpoint (basic check ke liye)
@app.get("/")
async def read_root():
    return {"message": "FastAPI backend is running! AI Letter Generator."}

# Letter generation endpoint
@app.post("/generate_letter/")
async def generate_letter(request: LetterRequest):
    prompt = f"""
    You are an AI assistant specialized in writing professional and effective letters.
    Generate a {request.category} in {request.language} based on the following description.
    Ensure the letter is well-structured, polite, and to the point, adopting a formal tone unless specified.

    Description: {request.description}

    Output only the letter content. Do not include any conversational text or formatting outside the letter itself.
    """
    
    try:
        response = model.generate_content(prompt)
        letter_content = response.text
        logger.info(f"Generated letter for category: {request.category}")
        return {"letter_content": letter_content}
    except Exception as e:
        logger.error(f"Error generating letter: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate letter: {e}")

# Email generation endpoint
@app.post("/generate_email/")
async def generate_email(request: EmailRequest):
    prompt = f"""
    You are an AI assistant specialized in writing professional and effective emails.
    Generate an email for a {request.category} in {request.language} based on the following description.
    Ensure the email is concise, professional, and follows a standard email format (Subject, Salutation, Body, Closing, Signature).
    The tone should be appropriate for the context, typically formal unless specified otherwise in the description.

    Description: {request.description}

    Output only the email content, including a suitable Subject line. Do not include any conversational text or formatting outside the email itself.
    """
    
    try:
        response = model.generate_content(prompt)
        email_content = response.text
        logger.info(f"Generated email for category: {request.category}")
        return {"email_content": email_content}
    except Exception as e:
        logger.error(f"Error generating email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate email: {e}")

# Sample description generation endpoint
@app.post("/generate_sample_description/")
async def generate_sample_description(request: SampleDescriptionRequest):
    prompt = f"""
    As an AI assistant, generate a brief and concise sample description (2-3 sentences) for a '{request.category}' in {request.language}.
    This description will be used as a placeholder in a form to guide the user.
    Example: 'I need a job application for a junior web developer position. I have basic knowledge of HTML, CSS, JavaScript, and React.'
    Output only the description text.
    """
    try:
        response = model.generate_content(prompt)
        sample_description = response.text
        logger.info(f"Generated sample description for category: {request.category}")
        return {"sample_description": sample_description}
    except Exception as e:
        logger.error(f"Error generating sample description: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate sample description: {e}")
