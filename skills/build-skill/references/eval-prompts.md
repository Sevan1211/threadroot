# Skill Eval Prompts

Use these prompt patterns to validate a skill.

## Should Trigger

- Ask for the exact workflow the skill claims to improve.
- Include ambiguous real-world constraints.
- Check whether the agent loads only relevant references.

## Should Not Trigger

- Ask for adjacent tasks that share vocabulary but not intent.
- Check that the skill description is not too broad.

## Output Checks

- Did the answer follow the skill workflow?
- Did it avoid irrelevant reference loading?
- Did it produce safer, more specific, or more complete output than a no-skill baseline?
