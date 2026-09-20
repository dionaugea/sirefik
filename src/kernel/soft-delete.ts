import { sql, type Generated, type RawBuilder } from "kysely";

/** 0 = aktif, 1 = dihapus. Baris ditandai, tidak pernah dihapus fisik. */
export const IS_DELETED = {
  no: 0,
  yes: 1,
} as const;

export type IsDeletedFlag = (typeof IS_DELETED)[keyof typeof IS_DELETED];

/**
 * Kolom audit standar (hasil analisis database, poin 3).
 * Dipakai semua tabel operasional; tabel master katalog/wilayah dikecualikan.
 */
export interface AuditColumns {
  is_created: Generated<number>;
  created_at: Generated<string | null>;
  user_created: number | null;
  is_edited: Generated<number>;
  edited_at: string | null;
  user_edited: number | null;
  is_deleted: Generated<IsDeletedFlag>;
  deleted_at: string | null;
  user_deleted: number | null;
}

/** Tabel master katalog masih memakai penanda lama `isDeleted`. */
export interface LegacySoftDeleteColumns {
  isDeleted: Generated<IsDeletedFlag>;
}

type Stamp = RawBuilder<string>;
const now = (): Stamp => sql<string>`CURRENT_TIMESTAMP`;

/** Nilai kolom audit saat membuat baris baru. */
export function auditCreate(actorId: number | null | undefined) {
  return {
    is_created: 1,
    created_at: now(),
    user_created: actorId ?? null,
  };
}

/** Nilai kolom audit saat mengubah baris. */
export function auditEdit(actorId: number | null | undefined) {
  return {
    is_edited: 1,
    edited_at: now(),
    user_edited: actorId ?? null,
  };
}

/** Nilai kolom audit saat soft delete. */
export function auditDelete(actorId: number | null | undefined) {
  return {
    is_deleted: IS_DELETED.yes,
    deleted_at: now(),
    user_deleted: actorId ?? null,
  };
}
