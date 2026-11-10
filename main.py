import joblib
from typing import Literal
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

Model = joblib.load("Mental_Health_Model.pkl")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

top_countries = ["Other", "India", "USA", "Canada", "Australia", "UK", "Germany", "Mexico", "Turkey", "France"]

# Pydantic model for input data
class StudentData(BaseModel):
    Age                     : int = Field(..., ge=5, le=100, description="Age of the student (5-100)")
    Gender                  : Literal['Male', 'Female']
    Country                 : str
    Academic_Level          : Literal['Undergraduate', 'Graduate', 'High School']
    # Fixed missing commas below between Twitter, YouTube, and TikTok
    Most_Used_Platform      : Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter', 'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp', 'WeChat']
    Purpose_Of_Use          : Literal['Networking', 'Education', 'Entertainment', 'News']
    Avg_Daily_Usage_Hours   : float = Field(..., ge=0, le=24)
    Daily_Unlocks           : int = Field(..., ge=0)
    Study_Hours             : float = Field(..., ge=0, le=24)
    Physical_Activity_Hours : float = Field(..., ge=0, le=24)
    Sleep_Hours_Per_Night   : float = Field(..., ge=0, le=24)
    Stress_Level            : Literal['Medium', 'Low', 'Very High', 'High']


@app.get("/")
def greet():
    return {"message": "Welcome to the Mental Health Prediction API!"}


class PredictionResponse(BaseModel):
    predicted_mental_health_score: float


@app.post("/predict", response_model=PredictionResponse)
def predict_mental_health(data: StudentData):
    country_group = data.Country if data.Country in top_countries else "Other"
    
    input_dict = {
        "Age"                     : data.Age,
        "Gender"                  : data.Gender,
        "Country"                 : data.Country,
        "Academic_Level"          : data.Academic_Level,
        "Most_Used_Platform"      : data.Most_Used_Platform,
        "Purpose_Of_Use"          : data.Purpose_Of_Use,
        "Avg_Daily_Usage_Hours"   : data.Avg_Daily_Usage_Hours,
        "Daily_Unlocks"           : data.Daily_Unlocks,
        "Study_Hours"             : data.Study_Hours,
        "Physical_Activity_Hours" : data.Physical_Activity_Hours,
        "Sleep_Hours_Per_Night"   : data.Sleep_Hours_Per_Night,
        "Stress_Level"            : data.Stress_Level,
        "Grouped_Country"         : country_group
    }

    input_data = pd.DataFrame([input_dict])

    # Terminal par check karein kya input aur output aa raha hai
    prediction = Model.predict(input_data)[0]
    print(f"DEBUG: Raw Model Prediction: {prediction}")

    return PredictionResponse(predicted_mental_health_score=round(float(prediction), 2))