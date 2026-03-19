# User Management Guide

## Overview
This application now has **restricted access** - only authorized users can sign in. Public sign-ups have been disabled and Google OAuth has been removed.

## How to Authorize New Users

Since public registration is disabled, you'll need to manually create user accounts through the Supabase Dashboard.

### Option 1: Create Users via Supabase Dashboard

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Users**
4. Click **Add user** (or **Invite**)
5. Enter the user's email address
6. Choose one of:
   - **Send invitation email** - User will receive an email to set their password
   - **Auto-generate password** - You can manually set/share the password

### Option 2: Use Supabase SQL Editor

You can also create users programmatically:

```sql
-- Create a new user with email/password
SELECT auth.users_insert(
  '{"email": "user@example.com", "password": "securepassword123"}'
);
```

### Option 3: Temporarily Enable Sign-ups

If you need to allow a user to self-register:

1. Open Supabase Dashboard
2. Go to **Authentication** → **Providers** → **Email**
3. Temporarily enable "**Enable sign ups**"
4. Share the app URL with the user to register
5. Disable sign-ups again after they register

## Managing Existing Users

### Reset User Password
1. Supabase Dashboard → **Authentication** → **Users**
2. Click the user's email
3. Click **Send password recovery**

### Delete User
1. Supabase Dashboard → **Authentication** → **Users**  
2. Click the user's email
3. Click **Delete user**

### View User Sessions
1. Supabase Dashboard → **Authentication** → **Users**
2. Click the user to see their active sessions

## Security Best Practices

- ✅ Keep sign-ups disabled in production
- ✅ Use strong passwords for all authorized users
- ✅ Regularly audit the user list
- ✅ Remove users who no longer need access
- ✅ Consider implementing row-level security (RLS) in Supabase for additional protection

