-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "eventEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Booking_status_eventEndsAt_idx" ON "Booking"("status", "eventEndsAt");

-- Backfill eventEndsAt for existing bookings: slot date + endTime read as IST, stored as UTC.
-- A gig whose end time is not after its start time runs past midnight, so it ends the next day.
UPDATE "Booking" AS b
SET "eventEndsAt" = (
  ((s."date" || ' ' || s."endTime")::timestamp
    + CASE WHEN s."endTime" <= s."startTime" THEN INTERVAL '1 day' ELSE INTERVAL '0' END)
  AT TIME ZONE 'Asia/Kolkata'
) AT TIME ZONE 'UTC'
FROM "AvailabilitySlot" AS s
WHERE b."slotId" = s."id"
  AND b."eventEndsAt" IS NULL
  AND s."date" ~ '^\d{4}-\d{2}-\d{2}$'
  AND s."endTime" ~ '^\d{2}:\d{2}$'
  AND s."startTime" ~ '^\d{2}:\d{2}$';

-- Bookings already marked COMPLETED (e.g. by admin/seed) get a completion time.
UPDATE "Booking" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;
