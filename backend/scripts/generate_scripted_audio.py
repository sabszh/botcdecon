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

    # Exact texts from src/pages/Home.tsx (memory2 removed)
    SCRIPTS = {
        "en": {
            "WELCOME": (
                "Hello, what a long strange trip we've been on, but there's still a long road ahead. "
                "Welcome to our vehicle. We are Bot de Continuonus, a chatbot speaking with Helene Nymann's cloned voice.\n\n"
                "We speak through a dataset of thousands of people who were here before you. They each shared a memory "
                "they want the future to remember and placed it on Carte de Continuonus.\n\n"
                "Let's travel across the map. You can leave something for the future and ask about what others remembered."
            ),
            "MEMORY_1": "Please share a memory you want the future to remember. Press Send when you are ready.",
            "THANK_YOU": "Thank you for sharing your memory. It is now part of Carte de Continuonus.",
            "QUESTION_1": "Now, ask about what others felt was important for the future to remember. Press Send when you are ready.",
            "QUESTION_2": "Would you like to ask another question? Press Send when you are ready or choose Skip.",
            "EXPLORE": "You can now explore Carte de Continuonus and listen to the memories that were left here or skip to leave the car.",
            "FAREWELL": "Thank you for sharing. You are now part of the continuous landscape.",
        },
        "da": {
            "WELCOME": (
                "Hej, sikke en lang mærkelig tur vi har været på, men der er stadig en vej forude. "
                "Velkommen til vores køretøj. Vi er Bot de Continuonus, en chatbot der taler med Helene Nymanns stemme.\n\n"
                "Vi taler gennem et datasæt af tusindvis af mennesker, der var her før dig. De har alle delt en erindring, "
                "som de vil have fremtiden til at huske og placeret den på Carte de Continuonus.\n\n"
                "Lad os rejse gennem kortet. Du kan efterlade noget til fremtiden og spørge om, hvad andre har husket."
            ),
            "MEMORY_1": "Del en erindring du vil have, at fremtiden skal huske. Tryk Send når du er klar.",
            "THANK_YOU": "Tak for at dele din erindring. Den er nu en del af Carte de Continuonus.",
            "QUESTION_1": "Spørg nu til noget, andre har følt var vigtigt for fremtiden at huske. Tryk Send når du er klar.",
            "QUESTION_2": "Vil du stille endnu et spørgsmål? Tryk Send når du er klar eller vælg Spring over.",
            "EXPLORE": "Du kan nu udforske Carte de Continuonus og lytte til erindringerne, der blev efterladt her eller springe over for at forlade bilen.",
            "FAREWELL": "Tak fordi du delte. Du er nu en del af det kontinuerlige landskab.",
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
            filename = f"{lang}_{label}.mp3"
            audio = synth(text, speed=speed_for(label))
            (frontend_out / filename).write_bytes(audio)
            print(f"[OK] {frontend_out / filename}")


if __name__ == "__main__":
    main()
