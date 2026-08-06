**Additions:**

- **Alternatives translations:** Now it shows alternative translations in the output area when available.
- **Alternatives translations for specific words in long texts:** Now it shows alternative translations for specific words in long texts when available. (Addition: This is could be unreliable because i didn't implement it quite right.)

**Fixes:**

- **Match only required modifiers for popup hotkey:** Match only the modifiers the combo requires and ignore extras, so phantom modifier state can no longer block the combo. This restores the behavior from before the configurable-hotkey refactor. #12 (by [@gmcky](https://github.com/gmcky))
- **Fixed Version mismatch:** Now build workflow gonna change version based on what's written in workflow_dispatch so the issue with update banner showing up in latest version will never happen.
