import {
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { Application } from './application.model';

@Table({ tableName: 'decline_lockouts', underscored: true, timestamps: true })
export class DeclineLockout extends Model<DeclineLockout> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column(DataType.UUID)
  sourceApplicationId: string;

  @Column({ type: DataType.STRING(24), allowNull: false }) applicationRef: string;
  @Column(DataType.STRING(254)) email: string;
  @Column(DataType.STRING(10)) phone: string;
  @Column(DataType.DATEONLY) dateOfBirth: string;
  @Column(DataType.STRING(40)) lastName: string;
  @Column(DataType.STRING(64)) ssnBlindIndex: string;
  @Column({ type: DataType.DATE, allowNull: false }) declinedAt: Date;
  @Column({ type: DataType.DATE, allowNull: false }) lockoutUntil: Date;
  @Column({ type: DataType.STRING(20), allowNull: false }) declineStage: string;
  @Column(DataType.JSONB) reasonCodes: string[];
}
