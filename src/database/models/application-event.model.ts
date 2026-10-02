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

@Table({ tableName: 'application_events', underscored: true, timestamps: true })
export class ApplicationEvent extends Model<ApplicationEvent> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column({ type: DataType.UUID, allowNull: false })
  applicationId: string;

  @BelongsTo(() => Application)
  application: Application;

  @Column({ type: DataType.STRING(60), allowNull: false }) eventType: string;
  @Column(DataType.JSONB) payload: any;

  @Default('system')
  @Column({ type: DataType.STRING(20), allowNull: false })
  actorType: string;

  @Column(DataType.UUID) actorId: string;
  @Column(DataType.STRING(45)) ipAddress: string;
}
