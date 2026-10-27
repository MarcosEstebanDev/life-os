-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'TEXT_EXTRACTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ObligationKind" AS ENUM ('PAYMENT', 'RENEWAL', 'DEADLINE', 'EXPIRY', 'OTHER');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('NONE', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL,
    "error" TEXT,
    "text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "ObligationKind" NOT NULL,
    "due_date" DATE,
    "recurrence" "Recurrence" NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "counterparty" TEXT,
    "source_document_id" UUID NOT NULL,
    "evidence" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" "ObligationStatus" NOT NULL,
    "series_key" TEXT NOT NULL,
    "possible_update_of" UUID,
    "done_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_sha256_key" ON "documents"("sha256");

-- CreateIndex
CREATE INDEX "obligations_series_key_idx" ON "obligations"("series_key");

-- CreateIndex
CREATE INDEX "obligations_status_idx" ON "obligations"("status");

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
