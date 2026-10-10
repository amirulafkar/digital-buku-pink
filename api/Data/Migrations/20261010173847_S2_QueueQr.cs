using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Data.Migrations
{
    /// <inheritdoc />
    public partial class S2_QueueQr : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "qr_token",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_qr_token", x => x.id);
                    table.ForeignKey(
                        name: "FK_qr_token_clinic_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinic",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "queue_entry",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    clinic_id = table.Column<Guid>(type: "uuid", nullable: false),
                    patient_id = table.Column<Guid>(type: "uuid", nullable: true),
                    walk_in_name = table.Column<string>(type: "text", nullable: true),
                    appointment_id = table.Column<Guid>(type: "uuid", nullable: true),
                    queue_date = table.Column<DateOnly>(type: "date", nullable: false),
                    queue_no = table.Column<string>(type: "text", nullable: false),
                    source = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<string>(type: "text", nullable: false),
                    urgent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    urgent_reason = table.Column<string>(type: "text", nullable: true),
                    room_id = table.Column<Guid>(type: "uuid", nullable: true),
                    staff_id = table.Column<Guid>(type: "uuid", nullable: true),
                    idempotency_key = table.Column<string>(type: "text", nullable: false),
                    checked_in_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    called_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    started_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_queue_entry", x => x.id);
                    table.CheckConstraint("ck_queue_entry_source", "source in ('qr','staff')");
                    table.CheckConstraint("ck_queue_entry_status", "status in ('waiting','called','in_room','completed','missed')");
                    table.CheckConstraint("ck_queue_entry_urgent_reason", "urgent = false or urgent_reason is not null");
                    table.CheckConstraint("ck_queue_entry_who", "patient_id is not null or walk_in_name is not null");
                    table.ForeignKey(
                        name: "FK_queue_entry_appointment_appointment_id",
                        column: x => x.appointment_id,
                        principalTable: "appointment",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_queue_entry_clinic_clinic_id",
                        column: x => x.clinic_id,
                        principalTable: "clinic",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_queue_entry_patient_patient_id",
                        column: x => x.patient_id,
                        principalTable: "patient",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_queue_entry_room_room_id",
                        column: x => x.room_id,
                        principalTable: "room",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_queue_entry_staff_staff_id",
                        column: x => x.staff_id,
                        principalTable: "staff",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_qr_token_clinic_id",
                table: "qr_token",
                column: "clinic_id");

            migrationBuilder.CreateIndex(
                name: "IX_qr_token_expires_at",
                table: "qr_token",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "IX_qr_token_token_hash",
                table: "qr_token",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_appointment_id",
                table: "queue_entry",
                column: "appointment_id");

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_clinic_id_queue_date_idempotency_key",
                table: "queue_entry",
                columns: new[] { "clinic_id", "queue_date", "idempotency_key" },
                unique: true,
                filter: "patient_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_clinic_id_queue_date_queue_no",
                table: "queue_entry",
                columns: new[] { "clinic_id", "queue_date", "queue_no" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_clinic_id_queue_date_status",
                table: "queue_entry",
                columns: new[] { "clinic_id", "queue_date", "status" });

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_idempotency_key_patient_id_queue_date",
                table: "queue_entry",
                columns: new[] { "idempotency_key", "patient_id", "queue_date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_patient_id_queue_date",
                table: "queue_entry",
                columns: new[] { "patient_id", "queue_date" },
                unique: true,
                filter: "status NOT IN ('completed','missed')");

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_room_id",
                table: "queue_entry",
                column: "room_id");

            migrationBuilder.CreateIndex(
                name: "IX_queue_entry_staff_id",
                table: "queue_entry",
                column: "staff_id");

            // New tables: least privilege (qr_token insert/select only; queue_entry no DELETE); never TRUNCATE. audit_log restrictions from S1_Init are unchanged.
            migrationBuilder.Sql(@"
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dbp_app') THEN
    GRANT SELECT, INSERT ON qr_token TO dbp_app;
    GRANT SELECT, INSERT, UPDATE ON queue_entry TO dbp_app;
  END IF;
END $$;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "qr_token");

            migrationBuilder.DropTable(
                name: "queue_entry");
        }
    }
}
