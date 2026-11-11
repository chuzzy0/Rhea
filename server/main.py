import os
from fastapi import FastAPI, HTTPException 
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import OpenAI
from dotenv import load_dotenv

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

        stream = client.chat.completions.create(
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
            max_tokens=500,
            stream = True 
        )

        def generate_response():
            for chunk in stream:
              content = chunk.choices[0].delta.content 
              if content:
                yield content

        return StreamingResponse(generate_response(), media_type="text/plain")



    except  Exception as e:
      raise HTTPException(status_code=500, detail=str(e))
