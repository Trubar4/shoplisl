# History Feature - Testing Checklist

## Articles Overview
- [ ] Count chips (#N) display correctly for articles with history
- [ ] Count chips show immediately on page load (not after navigation)
- [ ] Sorting works for all 4 options:
  - [ ] Name (A-Z)
  - [ ] Check count (highest first)
  - [ ] Last checked date (most recent first)
  - [ ] Last added date (most recent first)
- [ ] Sort preference persists after page reload
- [ ] Search + sort work together correctly

## Article Details Page
- [ ] Statistics section displays:
  - [ ] Last added date (+prefix, green)
  - [ ] Last checked date (-prefix, blue)
  - [ ] Check count (#N, orange)
- [ ] Edit buttons work:
  - [ ] Last added date opens date/time picker
  - [ ] Last checked date opens date/time picker
  - [ ] Check count opens number input dialog
  - [ ] Edited values display correctly
  - [ ] Edited values show warning message
- [ ] History log displays:
  - [ ] All check/uncheck events
  - [ ] Correct dates and times
  - [ ] List names for each event
  - [ ] + prefix (green) for unchecks/adds
  - [ ] - prefix (blue) for checks
  - [ ] Events sorted by most recent first
  - [ ] History displays on initial page load

## Data Persistence
- [ ] Check counts persist after page reload
- [ ] History events persist after page reload
- [ ] Edited stat values are temporary (overwritten on next action)
- [ ] Stats update immediately when checking/unchecking items
- [ ] Data syncs between local and production (same Firebase)

## Edge Cases
- [ ] Articles with no history show no statistics
- [ ] Articles in multiple lists show combined statistics
- [ ] Checking an article increases count by 1
- [ ] Unchecking an article updates "last added" date
- [ ] History older than 365 days is cleaned up
