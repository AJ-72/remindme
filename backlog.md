1. Integrate with google drive to store the reminders to support migration of phone or reinstallation.
2. Add audio support and image support [Audio half FIXED 2026-07-23 — voice-to-text via mic button + forwarded WhatsApp audio (Android only); image support still open. WhatsApp-audio transcription depends on an unverified real-device spike — may fall back to filename-only for real WhatsApp voice notes]
3. Integrate with calendars?
4. Verify the snooze flow
5. Show the reminder description in notification after taking user's consent [FIXED 2026-07-20]
6. Make the textboxes cleaner. The place holder text is overflowing today. [FIXED 2026-07-20]
7. Get a better icon for reminder app
8. How to publish to playstore for beta
9. Branding - Name of company should be CuriosMind Labs. Get an icon as well. Add an about tab and show an icon plus name as CuriousMind Labs [FIXED 2026-07-22 — placeholder icon only, app icon itself tracked separately in item 7]
10. Bug - Editing and saving the description is not working. I don't see the updated text saved when i open the reminder again. [FIXED 2026-07-21]
11. Bug - Tapping on mark as done in push notification doesn't make the push notificaiton disappear [FIXED 2026-07-21]
12. To be triaged bug - The reminder doesn't work the first time unless I do an edit and save again. This is not always true, but noticed once or twice. Do a a systematic analysis of code to check that everyhing is correct.  [FIXED 2026-07-21 — likely cause; please re-verify on a fresh install]
13. Feature enhancement - Its not easy to add a longer text in reminder box. Also, the ux is not intuitive to tell the user that they don't have to set the time manually and enter the reminder
14. Feature improvement - the parsing of text to understand the time is not very strong. Research whether there is a better alternative
15. Change the sorting of completed reminders. Sort by newest to oldest. Current reminders should be sorted by earliest reminder first in list [FIXED 2026-07-21]
16. Bugs found after new build with speech enabled -1. Enabling the speech option always downloads the language package. 2. The content of the speech is not saved in the reminder box. The speech option remains turned on until I press the button again. 4. The language package is always US English. [FIXED 2026-07-23 — (1) check `installedLocales` via `getSupportedLocales()` before triggering a download, skip if already installed; (2)+(3) mic was using `continuous` multi-utterance mode, which segmented speech into multiple results (dropping/overwriting text) and never auto-stopped after a phrase, leaving the toggle stuck on — switched to single-utterance mode so it captures one phrase and turns off automatically; (4) added `expo-localization` and pass the device's actual locale to both the offline-model download and the recognizer's `lang` option instead of a hardcoded "en-US"]