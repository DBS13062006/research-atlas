# PostgreSQL 18 with pgTAP and pg_prove, so constraint, trigger and RLS tests run inside the database.
FROM postgres:18

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-pgtap libtap-parser-sourcehandler-pgtap-perl \
 && rm -rf /var/lib/apt/lists/*
