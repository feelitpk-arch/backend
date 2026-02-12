import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './modules/auth/auth.service';

async function testLogin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  console.log('\n=== Testing Admin Login ===\n');

  // Test default admin
  try {
    console.log('Testing default admin (admin/admin123)...');
    const result1 = await authService.login({
      username: 'admin',
      password: 'admin123',
    });
    console.log('✅ Default admin login successful!');
    console.log('   Token:', result1.accessToken.substring(0, 50) + '...');
    console.log('   Admin ID:', result1.admin.id);
    console.log('   Username:', result1.admin.username);
    console.log('   Email:', result1.admin.email);
  } catch (error: any) {
    console.log('❌ Default admin login failed:', error.message);
  }

  console.log('\n');

  // Test feetitzain admin
  try {
    console.log('Testing feetitzain admin (feetitzain/Zain@1122)...');
    const result2 = await authService.login({
      username: 'feetitzain',
      password: 'Zain@1122',
    });
    console.log('✅ Feetitzain admin login successful!');
    console.log('   Token:', result2.accessToken.substring(0, 50) + '...');
    console.log('   Admin ID:', result2.admin.id);
    console.log('   Username:', result2.admin.username);
    console.log('   Email:', result2.admin.email);
  } catch (error: any) {
    console.log('❌ Feetitzain admin login failed:', error.message);
  }

  console.log('\n=== Login Test Complete ===\n');

  await app.close();
}

testLogin().catch(console.error);

