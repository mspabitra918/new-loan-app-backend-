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

@Table({ tableName: 'consents', underscored: true, timestamps: true })
export class Consent extends Model<Consent> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column({ type: DataType.UUID, allowNull: false })
  applicationId: string;

  @BelongsTo(() => Application)
  application: Application;

  @Column({ type: DataType.STRING(30), allowNull: false }) consentType: string;
  @Column({ type: DataType.SMALLINT, allowNull: false }) step: number;
  @Column({ type: DataType.TEXT, allowNull: false }) consentText: string;
  @Column({ type: DataType.STRING(64), allowNull: false }) consentTextHash: string;
  @Column({ type: DataType.STRING(20), allowNull: false }) versionId: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false }) checkboxState: boolean;
  @Column(DataType.JSONB) namedParties: string[];
  @Column({ type: DataType.DATE, allowNull: false }) consentedAt: Date;
  @Column(DataType.STRING(64)) timezone: string;
  @Column(DataType.STRING(45)) ipAddress: string;
  @Column(DataType.TEXT) userAgent: string;
  @Column(DataType.TEXT) pageUrl: string;
  @Column(DataType.STRING(64)) jornayaLeadid: string;
  @Column(DataType.TEXT) trustedformCertUrl: string;
  @Column(DataType.DATE) revokedAt: Date;
  @Column(DataType.STRING(60)) revocationMethod: string;
}
