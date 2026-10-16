export async function allocateStudentCode(
  db: D1Database,
  date = new Date(),
) {
  const year = date.getUTCFullYear();
  const row = await db
    .prepare(
      `INSERT INTO student_code_counters (year,last_number)
       VALUES (?,1)
       ON CONFLICT(year) DO UPDATE SET
         last_number=student_code_counters.last_number+1,
         updated_at=CURRENT_TIMESTAMP
       RETURNING last_number`,
    )
    .bind(year)
    .first<{ last_number: number }>();
  if (!row) throw new Error("Unable to allocate student code");
  const sequence = Number(row.last_number);
  return `STU-${String(year).slice(-2)}-${String(sequence).padStart(4, "0")}`;
}
