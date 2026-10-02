import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Application } from './application.model';
import { EmailLog } from './email-log.model';

/**
 * One planned bank-verification email.
 *
 * Six rows are written when Step 3 is submitted - two a day for three days -
 * and the drip runner walks them by `scheduledAt`. The row is the record of
 * intent; `email_logs` remains the record of delivery.
 */
@Table({ tableName: 'bank_verification_emails', underscored: true, timestamps: true })
export class BankVerificationEmail extends Model<BankVerificationEmail> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column({ type: DataType.UUID, allowNull: false })
  applicationId: string;

  @BelongsTo(() => Application)
  application: Application;

  /** 1..6 - position in this application's sequence. */
  @Column({ type: DataType.SMALLINT, allowNull: false }) sequence: number;

  /** 1..3 - which day of the three-day sequence. */
  @Column({ type: DataType.SMALLINT, allowNull: false }) day: number;

  /** Template key rendered at send time. */
  @Column({ type: DataType.STRING(60), allowNull: false }) emailType: string;

  @Column({ type: DataType.DATE, allowNull: false }) scheduledAt: Date;

  @Default('scheduled')
  @Column({ type: DataType.STRING(20), allowNull: false })
  status: string;

  @Default(0)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  attempts: number;

  @Column(DataType.DATE) sentAt: Date;
  @Column(DataType.DATE) cancelledAt: Date;
  @Column(DataType.STRING(60)) cancelReason: string;
  @Column(DataType.TEXT) lastError: string;

  @ForeignKey(() => EmailLog)
  @Column(DataType.UUID)
  emailLogId: string;
}
