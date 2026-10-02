import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

export type AdminRole =
  | 'agent'
  | 'closer'
  | 'verification'
  | 'underwriter'
  | 'compliance'
  | 'admin';

@Table({ tableName: 'admin_users', underscored: true, timestamps: true })
export class AdminUser extends Model<AdminUser> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING(254), allowNull: false, unique: true }) email: string;
  @Column({ type: DataType.STRING(255), allowNull: false }) passwordHash: string;
  @Column({ type: DataType.STRING(120), allowNull: false }) fullName: string;

  @Default('agent')
  @Column({
    type: DataType.ENUM('agent', 'closer', 'verification', 'underwriter', 'compliance', 'admin'),
    allowNull: false,
  })
  role: AdminRole;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isActive: boolean;

  @Column(DataType.DATE) lastLoginAt: Date;
  @Column(DataType.INET) lastLoginIp: string;
}
