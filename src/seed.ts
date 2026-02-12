import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SeedModule } from './seed/seed.module';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  try {
    console.log('🚀 Initializing seed script...\n');
    const app = await NestFactory.createApplicationContext(AppModule);
    const seedService = app.select(SeedModule).get(SeedService);
    await seedService.seed();
    await app.close();
    console.log('\n✨ Seed script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during seeding:', error);
    process.exit(1);
  }
}

bootstrap();

