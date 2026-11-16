# Grounded mission screening and Astro

Approved scope: preserve current local work; improve the mission interpretation → assessment → candidate explanation flow. Use only committed catalogue evidence. Do not manufacture ice distances, accessibility, or absent mineral tags.

Mission screening keeps ties and unknown data explicit. Unsupported prompt goals must appear in the assessment response and Astro answer, including when the model is unavailable. Research ranking remains separate from landing and analog scoring.

Astro resolves named candidates and ordinal candidates against the active computed ranking. Comparisons include both scores, factor differences, and relevant gaps. A grounded deterministic comparison remains available on provider failures. Evidence retrieved for explanations must pertain to the locations; computed rankings need no unrelated literature citation. Display numbers readably.

Frontend context follows the page: task assessments on Mission Design, mission candidate browsing and Analyze; directional analog context on analog views; selected Mars research context on Research; the displayed pair on Compare. History from earlier contexts is not reused as current evidence.

Validation: screenshot reproductions (Rio Tinto versus Jaroso; candidates 1 and 2), water prompt integration, ties, missing data, provider failure and model context; frontend request context across pages; existing backend/frontend regression suites and production build.

## Verified acceptance

The water-mineral regression is `backend/tests/test_objective_screening.py::WATER`. Expected catalogue matches are Columbus Crater, Hebrus Valles, Jezero Crater, Mawrth Vallis and Oxia Planum, tied on any-target mineral match. Ice proximity, water-equivalent hydrogen quantities and extraction accessibility remain unranked; jarosite and opal lack searchable catalogue tags.

Astro also receives the active survey run, weights, selected candidate and diversified display order in Find Analogs; survey IDs never enter curated catalogue selections.

Validation: 656 backend tests passed (28 skipped), 345 frontend tests passed, production build passed. Live provider responses checked for named/ordinal screenshot questions, Earth–Mars pair comparison and survey candidates. Browser automation was unavailable; browser visual QA was not performed.
