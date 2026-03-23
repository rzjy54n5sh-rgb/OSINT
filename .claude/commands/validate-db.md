# Validate DB — MENA Intel Desk Integrity Check

Run full database integrity checks for MENA Intel Desk.
Supabase URL: https://qmaszkkyukgiludcakjg.supabase.co
Use SUPABASE_SERVICE_ROLE_KEY from .env.local

## Checks to Run

### 1. NAI Scores — Invalid Categories
```sql
SELECT country_code, conflict_day, category
FROM nai_scores
WHERE category NOT IN ('ALIGNED', 'STABLE', 'TENSION', 'FRACTURE', 'INVERSION')
ORDER BY conflict_day DESC;
```
Expected: 0 rows. If any found → fix with UPDATE.

### 2. Scenario Probabilities — Sum Check
```sql
SELECT conflict_day,
       scenario_a + scenario_b + scenario_c + scenario_d AS abcd_sum,
       scenario_e
FROM scenario_probabilities
WHERE (scenario_a + scenario_b + scenario_c + scenario_d) != 100
ORDER BY conflict_day DESC;
```
Expected: 0 rows (A+B+C+D must always = 100; E is independent).

### 3. Country Reports — Missing country_name
```sql
SELECT country_code, conflict_day
FROM country_reports
WHERE country_name IS NULL OR country_name = '';
```
Expected: 0 rows.

### 4. Future Day Contamination
```sql
-- Calculate today's locked day first, then run:
SELECT conflict_day, COUNT(*) as rows
FROM nai_scores
WHERE conflict_day > [TODAYS_LOCKED_DAY]
GROUP BY conflict_day;
```
Expected: 0 rows. Any future rows = contamination → DELETE immediately.

### 5. disinfo_claims — Valid Verdicts
```sql
SELECT verdict, COUNT(*) as count
FROM disinfo_claims
GROUP BY verdict;
```
Expected verdicts: FALSE | MISLEADING | TRUE | UNVERIFIED only.

### 6. Article Count by Day
```sql
SELECT conflict_day, COUNT(*) as article_count
FROM articles
GROUP BY conflict_day
ORDER BY conflict_day DESC
LIMIT 10;
```
Report the counts — flag any day with 0 articles (pipeline may have failed).

## Report Format
After running all checks, report:
- ✅ PASSED or ❌ FAILED for each check
- Row counts and any anomalies found
- Recommended fixes for any failures
