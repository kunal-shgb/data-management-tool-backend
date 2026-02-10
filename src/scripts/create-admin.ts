import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';

import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
dotenv.config();

// Override env vars explicitly before anything else
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_USERNAME = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.DB_DATABASE = 'data_tool_db';

async function bootstrap() {
    try {
        const app = await NestFactory.createApplicationContext(AppModule);

        // Check if override worked
        const configService = app.get(ConfigService);
        const dbInfo = {
            host: configService.get('DB_HOST'),
            username: configService.get('DB_USERNAME'),
            passwordLength: configService.get('DB_PASSWORD')?.length,
        };
        console.log('DB Connection Info (Forces):', dbInfo);

        fs.writeFileSync('debug_info.log', JSON.stringify(dbInfo, null, 2));

        const usersService = app.get(UsersService);

        const args = process.argv.slice(2);
        const usernameArg = args.find(arg => arg.startsWith('--username='));
        const passwordArg = args.find(arg => arg.startsWith('--password='));

        if (!usernameArg || !passwordArg) {
            console.error('Usage: npm run create-admin -- --username=admin --password=securepassword');
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
            fs.appendFileSync('debug_info.log', '\nAdmin created successfully');
        } catch (error) {
            console.error('Error creating admin user:', error.message);
            fs.writeFileSync('error.log', `Error creating admin: ${error.message}\n${error.stack}`);
        } finally {
            await app.close();
        }
    } catch (err) {
        console.error('Bootstrap error', err);
        fs.writeFileSync('error.log', `Bootstrap error: ${err.message}\n${err.stack}`);
    }
}

bootstrap();
