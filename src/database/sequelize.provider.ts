import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Sequelize } from 'sequelize-typescript';
import { ALL_MODELS } from './models';

export const SEQUELIZE = 'SEQUELIZE';

const logger = new Logger('Sequelize');

/**
 * Schema is owned by sequelize-cli migrations - `sync()` is never called.
 * The app only authenticates and registers models.
 */
const sequelizeProvider: Provider = {
  provide: SEQUELIZE,
  inject: [ConfigService],
  useFactory: async (config: ConfigService) => {
    const db = config.get('db');
    const sequelize = new Sequelize({
      dialect: 'postgres',
      host: db.host,
      port: db.port,
      username: db.username,
      password: db.password,
      database: db.database,
      logging: config.get('env') === 'development' ? (msg) => logger.debug(msg) : false,
      define: { underscored: true, timestamps: true },
      pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
      dialectOptions: db.ssl
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    });

    sequelize.addModels(ALL_MODELS as any);
    await sequelize.authenticate();
    logger.log(`Connected to postgres://${db.host}:${db.port}/${db.database}`);
    return sequelize;
  },
};

/**
 * Each model is provided through a factory that depends on SEQUELIZE, so Nest
 * cannot hand a model to a service before addModels()/authenticate() has run.
 */
const modelProviders: Provider[] = ALL_MODELS.map((model) => ({
  provide: model,
  useFactory: () => model,
  inject: [SEQUELIZE],
}));

export const SequelizeModule = {
  providers: [sequelizeProvider, ...modelProviders],
  exports: [SEQUELIZE, ...ALL_MODELS],
};
