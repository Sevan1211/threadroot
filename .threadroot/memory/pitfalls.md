# Pitfalls
- External skill discovery during self-use found two product gaps: skills find --json can leak ANSI escape suffixes into candidate names/URLs, and several skills.sh results were not installable by Threadroot's resolver because their backing repo layout did not expose SKILL.md in an expected path. Treat this as a 0.1.8 improvement area.
