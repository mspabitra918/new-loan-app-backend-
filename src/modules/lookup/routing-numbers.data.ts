import fedachSample from '../../common/data/fedach-sample.json';

/**
 * FedACH participant subset, shared verbatim with the sequelize-cli seeder
 * (src/database/seeders) so the runtime fallback and the seeded table can
 * never drift. In production this is replaced by the Federal Reserve's
 * FedACH Participant file, refreshed daily into `fedach_participants`.
 *
 * Field 44 (bank name) is auto-populated from here and rendered read-only -
 * the applicant is never asked to type their bank's name.
 */
export const FEDACH_SAMPLE: Record<string, string> = fedachSample as Record<string, string>;
