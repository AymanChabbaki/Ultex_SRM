# Built on the exact same base as ubos-postgres so pg_dump's version always
# matches the server it's dumping from.
FROM postgres:16-alpine

RUN apk add --no-cache bash rclone tzdata dcron ca-certificates

COPY backup.sh /usr/local/bin/backup.sh
RUN sed -i 's/\r$//' /usr/local/bin/backup.sh && chmod +x /usr/local/bin/backup.sh

# Daily at 04:30 container time (TZ set via docker-compose environment) --
# offset from ULTEX's own 04:00 backup job so they don't contend if they
# ever run on the same host.
RUN echo "30 4 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1" > /etc/crontabs/root

# Run once immediately on start (so a fresh deploy is verified right away
# instead of waiting up to 24h for the first data point), then hand off to
# crond in the foreground for the daily schedule.
ENTRYPOINT ["sh", "-c", "/usr/local/bin/backup.sh >> /var/log/backup.log 2>&1; crond -f -l 2"]
