# Supabase Storage Setup for Stem Player

## Quick Setup Instructions

### 1. Create the Storage Bucket

1. Go to your Supabase dashboard: https://quxjesuarzbqqoahogma.supabase.co
2. Navigate to **Storage** in the left sidebar
3. Click **New bucket**
4. Configure the bucket:
   - **Name**: `stems`
   - **Public bucket**: **ON** (toggle this to enable)
   - **File size limit**: 50 MB (or higher if you have larger audio files)
   - **Allowed MIME types**: Leave empty to allow all audio formats
5. Click **Create bucket**

### 2. Configure Storage Policies

After creating the bucket, you need to set up Row Level Security (RLS) policies to allow uploads and downloads.

#### Option A: Simple Public Access (Recommended for Development)

**Method 1: Using the Policy Editor (Recommended)**

1. In the Storage section, click on the `stems` bucket
2. Click on **Policies** tab
3. You should see a message about RLS being enabled
4. Click **New policy**
5. Choose **Get started quickly** and select **Allow public access**
6. This will create policies for INSERT, SELECT, UPDATE, and DELETE automatically

**Method 2: Custom Policies (If you need more control)**

If the quick option doesn't work, or if you need to create policies manually:

1. Click **New policy** → **For full customization**
2. For **INSERT** (uploads):
   - **Policy name**: `Allow public uploads`
   - **Target roles**: Leave as `public` or select all
   - **USING expression**: Leave empty
   - **WITH CHECK expression**: Enter just: `true`
   - Click **Review** → **Save policy**

3. For **SELECT** (downloads):
   - Click **New policy** → **For full customization**
   - **Policy name**: `Allow public downloads`
   - **Target roles**: Leave as `public` or select all
   - **USING expression**: Enter just: `true`
   - **WITH CHECK expression**: Leave empty
   - Click **Review** → **Save policy**

4. For **DELETE** (removing stems):
   - Click **New policy** → **For full customization**
   - **Policy name**: `Allow public deletes`
   - **Target roles**: Leave as `public` or select all
   - **USING expression**: Enter just: `true`
   - **WITH CHECK expression**: Leave empty
   - Click **Review** → **Save policy**

**If you see a pre-filled form with `bucket_id = 'stems'`:**

The form is showing you an SQL builder. Just leave it as is or enter:
```
bucket_id = 'stems'::text
```

**IMPORTANT**:
- Don't copy code block markers (```sql or ```)
- Just type `true` or `bucket_id = 'stems'::text` depending on what the form asks for
- Make sure the bucket is marked as **Public** in the main bucket settings

#### Option B: Authenticated Users Only (Recommended for Production)

If you want only authenticated users to upload/download/delete files:

Replace the policy definitions above with:
```sql
auth.role() = 'authenticated'
```

### 3. Test the Upload

1. Start your development server: `npm run dev`
2. Open your app in the browser
3. Navigate to a text entry with the stem player visible
4. Click "Show Backing Tracks"
5. Try uploading an audio file (MP3, WAV, etc.)
6. Check the browser console for detailed logs

## Troubleshooting

### Error: "new row violates row-level security policy"

This means the RLS policies are not configured correctly. Make sure you've:
- Created the policies for INSERT, SELECT, and DELETE operations
- Set the policy definitions correctly (see above)

### Error: "Bucket not found"

The `stems` bucket doesn't exist yet. Follow Step 1 above to create it.

### Files upload but don't play

1. Make sure the bucket is marked as **Public**
2. Check that the audio file format is supported by the browser (MP3, WAV, OGG, etc.)
3. Open browser DevTools and check the Network tab for any CORS errors

### Large file uploads failing

1. Increase the **File size limit** in the bucket settings
2. Audio files can be large - consider setting it to 100MB or more

## Verification

After setup, you should see:
- ✅ A bucket named "stems" in your Storage section
- ✅ The bucket is marked as "Public"
- ✅ Three RLS policies: for INSERT, SELECT, and DELETE
- ✅ Console logs showing successful bucket detection when the app loads

## Security Notes

**For Development**: The "public access" policies (Option A) are fine.

**For Production**: Consider implementing user authentication and using Option B to restrict access to authenticated users only. You may also want to:
- Add file size validation
- Limit allowed MIME types to audio formats only
- Add file naming restrictions to prevent path traversal
- Implement storage quotas per user
