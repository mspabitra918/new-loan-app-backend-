import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from "sequelize-typescript";
import { Application } from "./application.model";
import { AdminUser } from "./admin-user.model";

/** Append-only. Nothing in the application updates or deletes these rows. */
@Table({
  tableName: "sensitive_access_logs",
  underscored: true,
  timestamps: true,
})
export class SensitiveAccessLog extends Model<SensitiveAccessLog> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Application)
  @Column({ type: DataType.UUID, allowNull: false })
  applicationId: string;

  @BelongsTo(() => Application, {
    foreignKey: "applicationId",
    targetKey: "id",
  })
  application: Application;

  @ForeignKey(() => AdminUser)
  @Column({ type: DataType.UUID, allowNull: false })
  adminUserId: string;

  @Column({ type: DataType.STRING(30), allowNull: false }) fieldName: string;

  @Default("reveal")
  @Column({ type: DataType.STRING(20), allowNull: false })
  action: string;

  @Column(DataType.STRING(200)) reason: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  granted: boolean;

  @Column(DataType.STRING(45)) ipAddress: string;
  @Column(DataType.TEXT) userAgent: string;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false })
  accessedAt: Date;
}
