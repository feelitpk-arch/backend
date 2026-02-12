# Debug JWT 401 Errors

## Problem
Getting 401 Unauthorized errors even though token is being sent correctly.

## Root Cause
The JWT validation is failing because `validateUser` can't find the admin in MongoDB. This happens when:
1. MongoDB is not connected
2. The admin user doesn't exist
3. The ObjectId conversion is failing

## Debugging Steps

### 1. Check MongoDB Connection
Look at backend logs - you should see:
```
[InstanceLoader] TypeOrmCoreModule dependencies initialized
```

If you see connection errors, MongoDB is not connected.

### 2. Verify Admin User Exists
Run the seed script:
```bash
cd backend
npm run seed
```

### 3. Test JWT Token Manually
Decode the JWT token (use jwt.io) and check:
- `sub` field should contain the admin ID
- Token should not be expired
- Secret should match `JWT_SECRET` in `.env`

### 4. Check Backend Logs
When you make a request, check backend console for:
- JWT validation errors
- MongoDB query errors
- Any exceptions in `validateUser`

## Quick Fix

If MongoDB connection is the issue:
1. Go to MongoDB Atlas → Network Access
2. Whitelist your IP address
3. Restart backend server

If admin doesn't exist:
1. Run `npm run seed` in backend folder
2. Verify admin was created

## Temporary Workaround

If MongoDB keeps disconnecting, you can temporarily disable JWT validation for testing (NOT for production):
- Comment out `@UseGuards(JwtAuthGuard)` in controllers
- This is ONLY for debugging - re-enable before production

