# Open Library `store_index` pkey update

## The Plan

1. Add a new `bigint` column:

```sql
ALTER TABLE store_index ADD COLUMN new_id bigint;
```

2. Add trigger to keep the original `id` column in-sync with the `new_id` column:

```sql
CREATE OR REPLACE FUNCTION store_index_sync_new_id() RETURNS trigger AS $$
BEGIN
  NEW.new_id := NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_new_id
BEFORE INSERT ON store_index
FOR EACH ROW EXECUTE FUNCTION store_index_sync_new_id();
```

3. Backfill the `new_id` column in batches:

```bash
docker exec openlibrary-cron-jobs-1 python -c _backfill_store_index.py -c /path/to/openlibrary.yml
```

4. Build unique index on new column

```sql
CREATE UNIQUE INDEX CONCURRENTLY new_id_unique_idx ON store_index(new_id);
```

5. Add `NOT NULL` constraint

```sql
ALTER TABLE store_index ADD CONSTRAINT new_id_not_null CHECK (new_id IS NOT NULL) NOT VALID;
ALTER TABLE store_index VALIDATE CONSTRAINT new_id_not_null;
```

`VALIDATE CONSTRAINT` takes Share Update Exclusive lock — doesn't block reads/writes, just other Data Definition Language (DDL).

6. Cutover

```sql
SET lock_timeout = '2s';
BEGIN;
  ALTER TABLE store_index DROP CONSTRAINT store_index_pkey; -- drops old PK on id
  ALTER TABLE store_index ADD CONSTRAINT store_index_pkey PRIMARY KEY USING INDEX new_id_unique_idx;
  ALTER TABLE store_index ALTER COLUMN new_id SET DEFAULT nextval('store_index_id_seq');
  ALTER SEQUENCE store_index_id_seq OWNED BY store_index.new_id;
  ALTER TABLE store_index RENAME COLUMN id TO id_old;
  ALTER TABLE store_index RENAME COLUMN new_id TO id;
  DROP TRIGGER trg_sync_new_id ON store_index;
COMMIT;
```

- Dropping/re-adding the PK, both renames, and the sequence ownership change are all metadata-only (Access Exclusive lock, but sub-second — no table rewrite).
- Renaming to `id_old` instead of dropping immediately lets you roll back or double check before the actual `DROP COLUMN id_old` in a later, separate migration.

7. Cleanup

```sql
ALTER TABLE store_index DROP COLUMN id_old;
ALTER TABLE store_index DROP CONSTRAINT new_id_not_null;
```
