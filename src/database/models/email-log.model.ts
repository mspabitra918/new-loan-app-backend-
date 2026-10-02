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

@Table({ tableName: 'email_logs', underscored: true, timestamps: true })
export class EmailLog extends Model<EmailLog> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column(DataType.UUID)
  applicationId: string;

  @BelongsTo(() => Application)
  application: Application;

  @Column({ type: DataType.STRING(60), allowNull: false }) templateKey: string;
  @Column({ type: DataType.STRING(254), allowNull: false }) toEmail: string;
  @Column({ type: DataType.STRING(255), allowNull: false }) subject: string;

  @Default('queued')
  @Column({ type: DataType.STRING(20), allowNull: false })
  status: string;

  @Default('mailercloud')
  @Column({ type: DataType.STRING(30), allowNull: false })
  provider: string;

  @Column(DataType.STRING(120)) providerMessageId: string;
  @Column(DataType.JSONB) providerResponse: any;
  @Column(DataType.TEXT) errorMessage: string;

  @Default(1)
  @Column({ type: DataType.SMALLINT, allowNull: false })
  attempt: number;

  @Column(DataType.STRING(80)) jobId: string;
  @Column(DataType.DATE) scheduledFor: Date;
  @Column(DataType.DATE) sentAt: Date;
}
