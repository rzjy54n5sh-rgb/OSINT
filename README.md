# ledger-hashes

Daily anchor of the MENA Intel Desk trust ledgers, written by .github/workflows/ledger-hash.yml on main.
One line per run: <snapshot UTC> <table>=<rows>:<sha256 of canonical export> ... forecast_head=<last row_hash> chain=<ok|BROKEN@seq:problem> run=<run id>.
A table that is absent from the database is recorded as <table>=absent.
This branch is append-only by convention: never rewrite or force-push it.
