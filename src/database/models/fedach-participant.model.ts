import { Column, DataType, Default, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 'fedach_participants', underscored: true, timestamps: true })
export class FedachParticipant extends Model<FedachParticipant> {
  @PrimaryKey
  @Column(DataType.STRING(9))
  routingNumber: string;

  @Column({ type: DataType.STRING(120), allowNull: false }) bankName: string;
  @Column(DataType.STRING(60)) city: string;
  @Column(DataType.STRING(2)) state: string;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isReceiving: boolean;
}
