# Route / state matrix (Phase 0 excerpt)

**Status:** Working notes for the 2026-09-20 UI revision. Not a claim that screenshots have been captured.  
**Fixtures:** `frontend/src/lib/fixtures/storedForecast.ts` (labelled test data only).

| Route family | Path examples | First question | Idle | Loading | Ready | Uncovered / empty | Error |
|---|---|---|---|---|---|---|---|
| Editorial | `/` | Who / dated when / how would I know it stopped? | Artifact panels say reading | Same | Artifact values | Zero published alerts in words | Unreadable artifact sentence |
| Lookup | `/upload` | Stored outlook for district + horizon? | Choose district and horizon | Skeleton + one status | Dated stored forecast | No stored coverage | Offline / 429 / server / invalid |
| Console | `/live` | Where is the outlook? | National overview | District request in flight | Stored panel when a district is selected | Baseline labelled as not a forecast | Same panel error mapping |
| Alerts | `/alerts`, `/alerts/:id` | Published? Evidence? | Empty published list | Reading payload | Cards / detail | No published alerts | Degraded notes |
| District | `/forecast/district/:id` | Outlook vs official warning | n/a | Page fetch | Hierarchy in the plan §3 | No coverage / no alert | Failed fetch |
| Auth | `/login` … | Sign in | Form | Busy submit | Redirect | n/a | Inline field/auth error |

Capture widths for later Phase 0 screenshots: 360, 390, 768, 1280, 1440.
