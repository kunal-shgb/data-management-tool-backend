import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  try {
    const app = await NestFactory.createApplicationContext(AppModule);

    const usersService = app.get(UsersService);

    const args = process.argv.slice(2);
    const usernameArg = args.find(
      (arg) => arg.startsWith('--username=') || arg.startsWith('--name='),
    );
    const passwordArg = args.find((arg) => arg.startsWith('--password='));

    if (!usernameArg || !passwordArg) {
      console.error(
        'Usage: npm run create-admin -- --username=admin --password=password',
      );
      process.exit(1);
    }

    const username = usernameArg.split('=')[1];
    const password = passwordArg.split('=')[1];

    try {
      const admin = await usersService.create({
        username,
        password,
        role: UserRole.ADMIN,
      });
      console.log(`Admin user ${admin.username} created successfully.`);
    } catch (error) {
      console.error('Error creating admin user:', error.message);
    } finally {
      await app.close();
    }
  } catch (err) {
    console.error('Bootstrap error', err);
  }
}

bootstrap();
