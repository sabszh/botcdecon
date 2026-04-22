import unittest

from backend.app.services.chat import _build_memory_confirmation_fallback, _strip_memory_acknowledgement


class StripMemoryAcknowledgementTests(unittest.TestCase):
    def test_strips_english_acknowledgement(self):
        self.assertEqual(
            _strip_memory_acknowledgement(
                'Thank you for sharing. This reminds us of someone who wrote "Stay."',
                'en',
            ),
            'This reminds us of someone who wrote "Stay."',
        )

    def test_strips_danish_acknowledgement_without_period(self):
        self.assertEqual(
            _strip_memory_acknowledgement(
                'Tak fordi du delte Det minder os om nogen, der sagde "Bliv."',
                'da',
            ),
            'Det minder os om nogen, der sagde "Bliv."',
        )

    def test_leaves_non_prefixed_text_unchanged(self):
        text = 'It also connects to someone who wrote "Keep the light on."'
        self.assertEqual(_strip_memory_acknowledgement(text, 'en'), text)


class MemoryConfirmationFallbackTests(unittest.TestCase):
    def test_danish_fallback_starts_with_expected_phrase(self):
        text = _build_memory_confirmation_fallback('da', 'at huske at kramme')
        self.assertTrue(text.startswith('Dit minde om'))
        self.assertIn('at huske at kramme', text)

    def test_english_fallback_starts_with_expected_phrase(self):
        text = _build_memory_confirmation_fallback('en', 'to remember care')
        self.assertTrue(text.startswith('Your memory about'))
        self.assertIn('to remember care', text)

    def test_danish_fallback_includes_retrieved_memory_when_available(self):
        text = _build_memory_confirmation_fallback('da', 'at huske at kramme', 'vi må huske at passe på hinanden')
        self.assertIn('vi må huske at passe på hinanden', text)


if __name__ == '__main__':
    unittest.main()
