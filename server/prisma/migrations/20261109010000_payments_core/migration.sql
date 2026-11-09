-- AlterTable
ALTER TABLE "ArtistProfile" ADD COLUMN     "payoutAccountId" TEXT,
ADD COLUMN     "payoutAccountLast4" TEXT,
ADD COLUMN     "payoutIfsc" TEXT,
ADD COLUMN     "payoutLegalName" TEXT,
ADD COLUMN     "payoutStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "amountPaise" INTEGER,
ADD COLUMN     "paymentDueAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "gatewayOrderId" TEXT NOT NULL,
    "gatewayPaymentId" TEXT,
    "gatewayTransferId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "artistSharePaise" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "refundedPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" SERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_bookingId_key" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment"("gatewayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "Payment"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_eventId_key" ON "PaymentEvent"("eventId");

-- CreateIndex
CREATE INDEX "Booking_status_paymentDueAt_idx" ON "Booking"("status", "paymentDueAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Open requests made before this migration can still be accepted and paid for,
-- so lock in the artist's current fee for them.
UPDATE "Booking" AS b
SET "amountPaise" = a."baseFee" * 100
FROM "ArtistProfile" AS a
WHERE b."artistId" = a."id" AND b."status" = 'REQUESTED' AND b."amountPaise" IS NULL;
