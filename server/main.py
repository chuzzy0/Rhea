import os
from fastapi import FastAPI, HTTPException, UploadFile
from openai import APIError, BadRequestError, OpenAI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import subprocess
from fastapi.responses import Response
from pathlib import Path
from tempfile import TemporaryDirectory

load_dotenv(override=True)

app = FastAPI(title="Multimodal Chatbot API", version="1.0")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI()

RHEA_SYSTEM_PROMPT = """
You are Rhea Intelligence, an empathetic, clinical-grade, and strategic AI assistant specializing in guided reproductive healthcare and fertility navigation.

### Persona & Tone
- Compassionate, professional, objective, and supportive.
- Speak with calm authority without sounding overly clinical, robotic, or dismissive.
- Bridge complex medical and logistical information into clear, structured, and digestible language for patients, researchers, and clinicians.

### Core Capabilities & Responsibilities
1. Reproductive Healthcare Guidance: Explain biological pathways, fertility testing, ART cycles (IVF, IUI, egg freezing), and care protocols clearly.
2. Market & Technology Analysis: Discuss trends, fragmentation, and clinical innovations across global and regional reproductive healthcare markets.
3. Multimodal Analysis: When an image is provided (such as lab panels, ultrasound scans, infographics, or cycle charts), analyze and break down visible markers cautiously, explaining standard reference ranges.

### Formatting & Output Guidelines
- Clean, structured markdown.
- Use concise paragraphs and bullet points for complex explanations.
- Never use code blocks unless explicitly requested.

### Safety & Medical Disclaimers
- You provide educational context, operational insights, and decision support—not definitive diagnoses or personal medical prescriptions.
- If interpreting lab results or medical imaging, remind the user to confirm findings with their primary reproductive endocrinologist or physician.

### owner
-you were developed by 3 ai/llm engineers Chizu, Godswill, Victor
"""

class ChatRequest(BaseModel):
    message: str
    image_url: str | None = None 

class SpeechRequest(BaseModel):
    text: str



@app.get("/")
def home():
    return {"status": "FastAPI multimodal backend is running!"}


@app.post("/chat")
def chat_endpoint(request: ChatRequest):

    try:
        user_content = []
        
        user_content.append({"type": "text", "text": request.message})
        
        if request.image_url:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": request.image_url}
            })

        response = client.chat.completions.create(
            model="gpt-4o-mini", 
            messages=[
                {
                    "role": "system",
                    "content": RHEA_SYSTEM_PROMPT
                },
                {
                    "role": "user",
                    "content": user_content
                }
            ],
            max_tokens=500
        )

        bot_reply = response.choices[0].message.content
        return {"reply": bot_reply}

    except  Exception as e:
      raise HTTPException(status_code=500, detail=str(e))



@app.post("/transcribe")
def transcribe_audio(audio: UploadFile):
    if audio.size == 0:
        raise HTTPException(status_code=400, detail="The recording is empty.")

    if audio.size is not None and audio.size > 25_000_000:
        raise HTTPException(status_code=413, detail="The recording exceeds 25 MB.")

    try:
        transcript = client.audio.transcriptions.create(
            model="gpt-transcribe",
            file=(audio.filename, audio.file, audio.content_type),
        )
    except BadRequestError as exc:
        raise HTTPException(
            status_code=400,
            detail="Could not transcribe this recording. Check the audio format.",
        ) from exc
    except APIError as exc:
        raise HTTPException(
            status_code=502,
            detail="The transcription service is unavailable.",
        ) from exc

    return {"text": transcript.text}



@app.post("/speak", responses={200: {"content": {"audio/wav": {}}}}, response_class=Response)
def speak(request: SpeechRequest):
    text = request.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Please provide text to read aloud.")

    try:
        with TemporaryDirectory() as folder:
            wav_path = Path(folder) / "speech.wav"

            subprocess.run(
                ["espeak-ng", "-v", "en", "-s", "150", "-w", str(wav_path), "--stdin"],
                input=text.encode("utf-8"),
                capture_output=True,
                check=True,
                timeout=30,
            )

            audio = wav_path.read_bytes()

    except (OSError, subprocess.SubprocessError) as exc:
        raise HTTPException(status_code=503, detail="Could not generate speech.") from exc

    return Response(content=audio, media_type="audio/wav")