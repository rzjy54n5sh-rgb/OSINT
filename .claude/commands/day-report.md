# Day Report — Full Pipeline for MENA Intel Desk

Run the complete Day $ARGUMENTS intelligence report pipeline.

## Steps (execute in this exact order)

1. **Calculate the locked day:**
   ```python
   import datetime
   DAY = (datetime.date.today() - datetime.date(2026, 2, 28)).days + 1
   ```
   Never use DB max+1. Never hardcode.

2. **Run all 6 mandatory web searches:**
   - "US Iran war latest news Day {DAY} {date}"
   - "Egypt Sisi Iran war {date} economy Suez Canal pound"
   - "UAE Iran war {date} strikes military business Dubai"
   - "Kharg Island Iran oil {date}" + "business opportunities UAE Egypt Iran war"
   - "Iran IRGC True Promise IV Araghchi {date}" — REQUIRED for structural neutrality
   - "Iran civilian casualties US Israel strikes {date}" — REQUIRED for structural neutrality

3. **Synthesize intelligence** — note what changed vs previous day

4. **Build all 11 deliverables:**
   - `General_Intelligence_Brief_Day{DAY}.docx`
   - `Egypt_Country_Brief_Day{DAY}.docx`
   - `UAE_Country_Brief_Day{DAY}.docx`
   - `Eschatology_Geopolitics_Day{DAY}.docx`
   - `Business_Opportunities_UAE_Egypt_Day{DAY}.docx`
   - `AR_General_Intelligence_Brief_Day{DAY}.docx`
   - `AR_Egypt_Country_Brief_Day{DAY}.docx`
   - `AR_UAE_Country_Brief_Day{DAY}.docx`
   - `AR_Eschatology_Geopolitics_Day{DAY}.docx`
   - `AR_Business_Opportunities_Day{DAY}.docx`
   - `platform_update_day{DAY}.sql`

5. **Validate each docx:** `python3 validate.py [file]` — fix any that fail before continuing

6. **Present all 11 files**

7. **Post summary table:** what changed vs previous day

## Rules
- Never fabricate. No new data → carry forward with "[unchanged from Day X]" note
- Iranian perspective mandatory in all reports
- Civilian harm in Iran mandatory in General Brief
- Arabic reports: AlignmentType.RIGHT + bidirectional:true on every Paragraph
- sentBar returns array [labelParagraph, tableElement]
- Platform SQL: idempotent, DAY lock at top, verification SELECT at end
