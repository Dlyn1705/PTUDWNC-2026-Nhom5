using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CulinaryBlog.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class QuarantineUnknownWelcomeEmailOutcomes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Legacy attempts cannot prove whether SMTP accepted a message. Preserve intent
            // and require evidence instead of silently retrying them after deployment.
            migrationBuilder.Sql("""
                UPDATE "WelcomeEmailDeliveries"
                SET "Status" = 'NeedsReview', "LastErrorCode" = 'LegacyOutcomeUnknown'
                WHERE "Status" = 'Processing' OR ("Status" = 'Pending' AND "AttemptCount" > 0)
                   OR ("Status" = 'Failed' AND "LastErrorCode" = 'RollbackReviewRequired');
                """);
            migrationBuilder.AddColumn<DateTime>(
                name: "SubmissionStartedAt",
                table: "WelcomeEmailDeliveries",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WelcomeEmailReconciliations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryId = table.Column<Guid>(type: "uuid", nullable: false),
                    Outcome = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ActorId = table.Column<string>(type: "character varying(450)", maxLength: 450, nullable: false),
                    EvidenceReference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WelcomeEmailReconciliations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WelcomeEmailReconciliations_CreatedAt",
                table: "WelcomeEmailReconciliations",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_WelcomeEmailReconciliations_DeliveryId_EvidenceReference",
                table: "WelcomeEmailReconciliations",
                columns: new[] { "DeliveryId", "EvidenceReference" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Older binaries cannot parse NeedsReview. Failed prevents rollback from resending.
            migrationBuilder.Sql("""
                UPDATE "WelcomeEmailDeliveries" SET "Status" = 'Failed', "LastErrorCode" = 'RollbackReviewRequired'
                WHERE "Status" = 'NeedsReview';
                """);
            migrationBuilder.DropTable(
                name: "WelcomeEmailReconciliations");

            migrationBuilder.DropColumn(
                name: "SubmissionStartedAt",
                table: "WelcomeEmailDeliveries");
        }
    }
}
