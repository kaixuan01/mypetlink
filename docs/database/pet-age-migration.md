# Pet Age Migration

`AddEstimatedBirthYear` adds nullable `smallint` column
`Pets.EstimatedBirthYear`. The migration does not drop or overwrite `Birthday`,
`EstimatedAgeLabel`, or any pet record.

## Legacy data handling

The local development database was inspected before the migration was created.
Its 21 pet rows had null `Birthday` and null `EstimatedAgeLabel`; no additional
production formats were available locally. The historical frontend seed data
contained `Estimated N years`, `N years`, and `Estimated YYYY` display values.

The SQL backfill only converts unambiguous `Estimated N year(s)`, `N year(s)`,
and under-one labels when `Birthday` is null. It derives an approximate birth
year from the record's creation year. `Unknown`, `15+`, arbitrary text, and any
row with `Birthday` remain unchanged. The original `EstimatedAgeLabel` is
preserved for audit and rollback review.

Application reads always prioritize a valid `Birthday`, then
`EstimatedBirthYear`, then `Age unknown`. New saves clear the legacy label and
normalize the two current fields according to the selected age mode.

## Later cleanup

`EstimatedAgeLabel` can be removed in a separate migration only after:

1. the additive migration has run successfully in every environment;
2. unconverted non-null labels have been reviewed or corrected;
3. all deployed application versions have stopped reading or writing the
   legacy column; and
4. a production backup and rollback plan have been confirmed.

Until then, the column must remain nullable and intact.
