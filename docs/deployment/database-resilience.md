# Database resilience operations

MyPetLink uses EF Core's SQL Server retrying execution strategy for short-lived
Azure SQL availability and throttling events. Browser retries are limited to
GET and HEAD requests that receive both HTTP 503 and the
`database_waking_up` error code. The application does not issue keep-alive
queries or background readiness polling.

## Production configuration

API environment variables:

```text
DatabaseResilience__MaxRetryCount=6
DatabaseResilience__MaxRetryDelaySeconds=10
DatabaseResilience__ApiRetryAfterSeconds=3
```

Cloudflare Pages build variables:

```text
NEXT_PUBLIC_DATABASE_WAKE_MAX_ATTEMPTS=6
NEXT_PUBLIC_DATABASE_WAKE_MAXIMUM_WAIT_SECONDS=45
```

Deploy the API first, verify `/health/live` and `/health/ready`, then deploy the
frontend. The existing `/health` and `/api/v1/health/ready` endpoints remain
available for compatibility.

## Monitoring

No paid monitoring dependency is introduced. Configure an alert in the
existing hosting/monitoring platform for repeated 503 responses whose internal
error code is `database_waking_up`, or repeated warning logs containing
"Temporary database availability event". Alert on sustained failures rather
than a single expected wake-up.

The structured warning includes request ID, HTTP method, endpoint path,
exception type and SQL error number. It never includes connection strings,
credentials, tokens or request bodies.

## Extended unavailability and free allowance checks

If bounded retries continue to fail, check the Azure Portal privately:

1. Azure SQL database status and recent availability events.
2. Remaining monthly free vCore allowance and the configured free-limit action.
3. Whether the database is paused, resuming, throttled or unavailable because
   the free allowance has been exhausted.
4. Azure Service Health for a regional incident.
5. API warning/error logs correlated by `X-Request-ID`.

Free-tier or billing details must not be shown to owners or public profile
visitors.
