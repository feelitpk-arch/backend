import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from '../../entities/admin.entity';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { toObjectId } from '../../common/utils/mongodb.util';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    // Try to find admin by username
    const admin = await this.adminRepository.findOne({
      where: { username: loginDto.username, isActive: true },
    });

    if (!admin) {
      // Also try to find by email in case user entered email as username
      const adminByEmail = await this.adminRepository.findOne({
        where: { email: loginDto.username, isActive: true },
      });
      
      if (!adminByEmail) {
        throw new UnauthorizedException('Invalid username or password');
      }
      
      // Use admin found by email
      const isPasswordValid = await bcrypt.compare(loginDto.password, adminByEmail.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid username or password');
      }
      
      // Ensure we use the string representation of the ObjectId
      const adminId = adminByEmail.id instanceof Object ? adminByEmail.id.toString() : adminByEmail.id;
      const payload = { sub: adminId, username: adminByEmail.username };
      const accessToken = this.jwtService.sign(payload);

      return {
        accessToken,
        admin: {
          id: adminId,
          username: adminByEmail.username,
          email: adminByEmail.email,
        },
      };
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, admin.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid username or password');
    }

    // Ensure we use the string representation of the ObjectId
    // Ensure we use the string representation of the ObjectId
    const adminId = admin.id instanceof Object ? admin.id.toString() : admin.id;
    const payload = { sub: adminId, username: admin.username };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      admin: {
        id: adminId,
        username: admin.username,
        email: admin.email,
      },
    };
  }

  async validateUser(userId: string): Promise<Admin | null> {
    try {
      if (!userId) {
        console.error('❌ validateUser: userId is empty');
        return null;
      }
      
      console.log('🔍 validateUser: Looking for admin with userId:', userId);
      
      // Convert to ObjectId (same approach as products/orders services)
      let objectId;
      try {
        objectId = toObjectId(userId);
        console.log('✅ validateUser: ObjectId conversion successful:', objectId.toString());
      } catch (error) {
        console.error('❌ validateUser: ObjectId conversion failed:', error);
        return null;
      }
      
      // Find admin by id - TypeORM MongoDB uses 'id' field, same as products/orders
      // Try with ObjectId first
      let admin = await this.adminRepository.findOne({
        where: { id: objectId as any, isActive: true },
      });
      
      if (admin) {
        console.log('✅ validateUser: Admin found with isActive filter');
        return admin;
      }
      
      // If not found, try without isActive filter (in case admin exists but flag is wrong)
      admin = await this.adminRepository.findOne({
        where: { id: objectId as any },
      });
      
      if (admin) {
        console.log('✅ validateUser: Admin found without isActive filter');
        return admin;
      }
      
      // If still not found, try using MongoDB manager directly (fallback)
      const manager = this.adminRepository.manager;
      admin = await manager.findOne(Admin, {
        where: { id: objectId as any },
      });
      
      if (admin) {
        console.log('✅ validateUser: Admin found using manager');
        return admin;
      }
      
      // Try using MongoDB native driver directly
      try {
        const mongoManager = manager.getMongoRepository(Admin);
        admin = await mongoManager.findOne({
          where: { _id: objectId },
        } as any);
        if (admin) {
          console.log('✅ validateUser: Admin found using MongoDB native driver');
          return admin;
        }
      } catch (mongoError) {
        console.error('❌ validateUser: MongoDB native driver query failed:', mongoError);
      }
      
      // Last resort: try querying by string ID directly (TypeORM MongoDB sometimes accepts this)
      try {
        admin = await this.adminRepository.findOne({
          where: { id: userId as any, isActive: true },
        });
        if (admin) {
          console.log('✅ validateUser: Admin found using string ID with isActive');
          return admin;
        }
        
        admin = await this.adminRepository.findOne({
          where: { id: userId as any },
        });
        if (admin) {
          console.log('✅ validateUser: Admin found using string ID');
          return admin;
        }
      } catch (stringQueryError) {
        console.error('❌ validateUser: String ID query failed:', stringQueryError);
      }
      
      // Also try to find all admins to see what IDs exist (debugging only)
      try {
        const allAdmins = await this.adminRepository.find();
        console.log('🔍 validateUser: All admins in DB:', allAdmins.map(a => ({ 
          id: a.id?.toString(), 
          username: a.username,
          isActive: a.isActive 
        })));
      } catch (debugError) {
        console.error('❌ validateUser: Could not fetch all admins for debugging:', debugError);
      }
      
      console.error('❌ validateUser: Admin not found in database for userId:', userId);
      return null;
    } catch (error) {
      // If ObjectId conversion or query fails, return null
      console.error('❌ validateUser: Exception occurred:', error);
      return null;
    }
  }
}

