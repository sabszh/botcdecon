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

    # Exact texts from src/components/ChatPanel.tsx
    SCRIPTS = {
        "en": {
            "WELCOME": (
                "Hello!\n\n"
                "Thank you for being here. What a long strange trip we’ve been on, but there’s still a long road ahead.\n\n"
                "Welcome to our vehicle. We are Bot de ContinuOnus an AI generated chatbot speaking in the cloned voice of the artist Helene Nymann.\n\n"
                "We may have her voice, but we’re speaking through a data set or rather through the experiences of thousands of people who were here before you. All of whom have shared what they remember that they want the future to remember. They have placed that memory onto a website known as continuonus. On the website a map known as Carte de Continuonus is being cultivated.\n\n"
                "Now let's journey through that map. In here you may share thing that you feel is important for the future to remember and you can ask us about what previous visitors shared?"
            ),
            "MEMORY_1": (
                "Please share a memory? Something you’d like those people in the future to remember to remember. Press the Share button when you’re done."
            ),
            # THANK_YOU is still used by the frontend even though it's not in ChatPanel.scripts
            "THANK_YOU": "Thank you for sharing your memory. It is now part of Carte de Continuonus.",
            "QUESTION_1": (
                "Thank you for sharing. Now would you ask us about what others have felt it was important for the future to remember to remember? You are in their future. You can ask about emotions, or topics, or something you’ve been wondering about. Press the Share button when you’re done."
            ),
            "QUESTION_2": (
                "Would you like to ask something else before continuing on? Press the Share button when you’re done."
            ),
            # Empty in ChatPanel; skip generation if empty
            "EXPLORE": "",
            "FAREWELL": (
                "Thank you for taking this part of the journey with us. You too are part of the continuOnus landscape now. Hoping to see you in the future."
            ),
        },
        "da": {
            "WELCOME": (
                "Hej!\n\n"
                "Tak fordi du er her. Sikke en lang, mærkelig rejse vi har været på, men der er stadig en lang vej foran os.\n\n"
                "Velkommen til vores køretøj. Vi er Bot de ContinuOnus, en AI‑genereret chatbot, der taler med kunstneren Helene Nymanns klonede stemme.\n\n"
                "Vi har måske hendes stemme, men vi taler gennem et datasæt — eller rettere gennem erfaringerne fra tusindvis af mennesker, der var her før dig. De har alle delt det, de husker, som de ønsker, at fremtiden skal huske. De har placeret den erindring på en hjemmeside kendt som ContinuOnus. På hjemmesiden opbygges et kort kendt som Carte de Continuonus.\n\n"
                "Lad os nu rejse gennem det kort. Her kan du dele noget, som du føler er vigtigt for fremtiden at huske, og du kan spørge os om, hvad tidligere besøgende har delt?"
            ),
            "MEMORY_1": (
                "Vil du dele en erindring? Noget du gerne vil have, at mennesker i fremtiden skal huske at huske. Tryk på Del, når du er færdig."
            ),
            # THANK_YOU is still used by the frontend even though it's not in ChatPanel.scripts
            "THANK_YOU": "Tak for at dele din erindring. Den er nu en del af Carte de Continuonus.",
            "QUESTION_1": (
                "Tak fordi du delte. Vil du nu spørge os om, hvad andre har følt var vigtigt for fremtiden at huske at huske? Du er i deres fremtid. Du kan spørge om følelser, emner eller noget, du har undret dig over. Tryk på Del, når du er færdig."
            ),
            "QUESTION_2": (
                "Vil du spørge om noget mere, før vi fortsætter? Tryk på Del, når du er færdig."
            ),
            # Empty in ChatPanel; skip generation if empty
            "EXPLORE": "",
            "FAREWELL": (
                "Tak fordi du tog denne del af rejsen sammen med os. Du er nu også en del af continuOnus‑landskabet. Vi håber at se dig i fremtiden."
            ),
        },
    }

    # Save only to frontend public inside this repo (continuonus-app/public/audio)
    # __file__ => .../continuonus-app/backend/scripts/generate_scripted_audio.py
    # parents[2] => .../continuonus-app
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
        return "slow" if label in {"WELCOME", "EXPLORE", "FAREWELL"} else "normal"

    for lang, items in SCRIPTS.items():
        for label, text in items.items():
            # Skip generating audio for empty texts
            if not (text or "").strip():
                continue
            filename = f"{lang}_{label}.mp3"
            audio = synth(text, speed=speed_for(label))
            (frontend_out / filename).write_bytes(audio)
            print(f"[OK] {frontend_out / filename}")


if __name__ == "__main__":
    main()
