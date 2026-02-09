
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types
from trainer import load_knowledge_base

# Setup
app = FastAPI()

# API Key should be set in environment
API_KEY = os.environ.get("API_KEY")
if not API_KEY:
    print("Warning: API_KEY not found in environment")

client = genai.Client(api_key=API_KEY)

class ChatRequest(BaseModel):
    message: str

@app.post("/ask")
async def ask_assistant(request: ChatRequest):
    try:
        # Load the latest knowledge base from the trainer script
        # In a real app, this would be cached or stored in a vector DB
        context = load_knowledge_base()
        
        system_instruction = f"""
        You are a helpful pharmacy assistant for Medzo Shop.
        Use the following knowledge base to answer questions about available medicines and pharmacies.
        
        KNOWLEDGE BASE:
        {context}
        
        Rules:
        1. Be polite and professional.
        2. Only recommend medicines found in the knowledge base.
        3. If a medicine is out of stock, suggest alternatives if available in the same category.
        4. Do not give medical advice beyond what is in the data.
        """

        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=request.message,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7
            )
        )
        
        return {"response": response.text}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
