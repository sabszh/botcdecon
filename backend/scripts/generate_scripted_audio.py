import os
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs


def main() -> None:
    load_dotenv()

    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("VOICE_ID", "4PzN60Ir6O2U6RzaQ5fm")
    model_id = os.getenv("MODEL_ID", "eleven_multilingual_v2")
    if not api_key:
        raise SystemExit("ELEVENLABS_API_KEY is missing in environment/.env")

    client = ElevenLabs(api_key=api_key)

    SCRIPTS = {
        "en": {
            "WELCOME": (
                "Hello!\n\n"
                "Welcome to our vehicle. What a long strange trip we’ve been on, but there’s still a long road ahead.\n\n"
                "We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.\n\n"
                "We may have her voice, but we’re speaking through a data set of the experiences of people who were here before you. All of whom have shared what they remember that they want the future to remember."
            ),
            "MEMORY_1": (
                "Please feel free to share your own memory. Something you’d like others in the future to remember to remember. Press the Share button when you’re done."
            ),
            "THANK_YOU": "Thank you for sharing.",
            "QUESTION_1": (
                "You are welcome to now further explore what others before you have shared. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done."
            ),
            "QUESTION_2": (
                "Would you like to ask something else or share another memory. Please do so now.\n"
                "Press the Share button when you’re done. If you want to end this session, press return."
            ),
            "RETURN_PROMPT": (
                "Thank you for sharing. Before you go, may we ask you, where do you think we are going?"
            ),
            "FAREWELL": (
                "Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future."
            ),
        },
        "da": {
            "WELCOME": (
                "Hej!\n\n"
                "Velkommen til vores køretøj. Sikke en lang og mærkelig rejse vi har været på, men der er stadig en lang vej foran os.\n\n"
                "Vi er Bot de ContinuOnus, en AI-genereret chatbot, der taler med den klonede stemme fra kunstneren Helene Nymann.\n\n"
                "Vi har måske hendes stemme, men vi taler gennem et datasæt af oplevelser fra mennesker, der var her før dig. Alle har de delt det, de husker, og det de ønsker, at fremtiden skal huske."
            ),
            "MEMORY_1": (
                "Du er meget velkommen til at dele dit eget minde. Noget du gerne vil have, at andre i fremtiden skal huske. Tryk på Del-knappen, når du er færdig."
            ),
            "THANK_YOU": "Tak fordi du delte.",
            "QUESTION_1": (
                "Du er velkommen til nu at udforske, hvad andre før dig har delt. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del-knappen, når du er færdig."
            ),
            "QUESTION_2": (
                "Vil du stille et andet spørgsmål eller dele endnu et minde? Gør det nu. Tryk på Del-knappen, når du er færdig. Hvis du vil afslutte sessionen, tryk på Tilbage."
            ),
            "RETURN_PROMPT": (
                "Tak fordi du delte. Inden du går, må vi spørge dig, hvor tror du, vi er på vej hen?"
            ),
            "FAREWELL": (
                "Tak fordi du tog denne del af rejsen med os. Du er nu også en del af continuOnus-landskabet. Vi håber at se dig igen i fremtiden."
            ),
        },
    }

    frontend_out = Path(__file__).resolve().parents[2] / "public" / "audio"
    frontend_out.mkdir(parents=True, exist_ok=True)

    def synth(text: str, speed: str = "normal") -> bytes:
        voice_settings = {
            "stability": 0.5,
            "similarity_boost": 0.8,
            "style": 0.5,
            "use_speaker_boost": True,
        }
        if speed == "slow":
            voice_settings["stability"] = 0.7
            voice_settings["style"] = 0.3
        audio = client.text_to_speech.convert(
            text=text,
            voice_id=voice_id,
            model_id=model_id,
            output_format="mp3_44100_128",
            voice_settings=voice_settings,
        )
        return audio if isinstance(audio, (bytes, bytearray)) else b"".join(audio)

    def speed_for(label: str) -> str:
        return "slow" if label in {"WELCOME", "FAREWELL"} else "normal"

    for lang, items in SCRIPTS.items():
        for label, text in items.items():
            if not (text or "").strip():
                continue
            filename = f"{lang}_{label}.mp3"
            audio = synth(text, speed=speed_for(label))
            (frontend_out / filename).write_bytes(audio)
            print(f"[OK] {frontend_out / filename}")


if __name__ == "__main__":
    main()
