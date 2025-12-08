# Quick Setup Guide

## Step 1: Install Dependencies

```bash
npm run install-all
```

## Step 2: Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable **Authentication** → **Email/Password**
4. Create **Firestore Database** (start in test mode for development)
5. Go to **Project Settings** → **Service Accounts**
6. Click **Generate New Private Key**
7. Copy the entire JSON content

## Step 3: Configure Backblaze B2

1. Sign up at [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html)
2. Create a **Public Bucket**
3. Note down:
   - Application Key ID
   - Application Key
   - Bucket ID (found in bucket settings)
   - Bucket Name
   - Region (e.g., us-west-004)

## Step 4: Set Environment Variables

### Server Configuration

Create `server/.env`:

```env
PORT=5000

FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

B2_APPLICATION_KEY_ID=your_application_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET_ID=your_bucket_id
B2_BUCKET_NAME=your_bucket_name
B2_REGION=us-west-004
```

**Important**: The `FIREBASE_SERVICE_ACCOUNT` should be the entire JSON object as a single line string.

### Client Configuration

Create `client/.env`:

```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_B2_BUCKET_ID=your_bucket_id
REACT_APP_B2_REGION=us-west-004
```

You can find Firebase config values in **Project Settings** → **General** → **Your apps** → **Web app config**.

## Step 5: Add Books to Firestore

1. Go to Firestore Database in Firebase Console
2. Create a collection named `books`
3. Add documents with this structure:

```json
{
  "title": "The Great Gatsby",
  "author": "F. Scott Fitzgerald",
  "description": "A classic American novel...",
  "coverImage": "https://example.com/cover.jpg",
  "b2FileName": "great-gatsby.pdf",
  "fileName": "great-gatsby.pdf"
}
```

4. Upload your PDF files to Backblaze B2 bucket with the same filename as `b2FileName`

## Step 6: Run the Application

```bash
npm run dev
```

This will start:
- Backend server on `http://localhost:5000`
- Frontend app on `http://localhost:3000`

## Troubleshooting

### PDF not loading?
- Check that the PDF file is uploaded to Backblaze B2
- Verify the `b2FileName` in Firestore matches the actual filename in B2
- Check browser console for CORS errors (ensure B2 bucket is public)

### Authentication not working?
- Verify Firebase Authentication is enabled
- Check that email/password provider is enabled
- Ensure Firebase config values are correct in `client/.env`

### API errors?
- Make sure backend server is running
- Check `server/.env` configuration
- Verify Firebase service account JSON is properly formatted

