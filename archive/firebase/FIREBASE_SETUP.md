# Firebase Cloud Functions Setup Guide

This guide covers setting up and deploying Cloud Functions for protocol validation.

## Prerequisites

- Node.js 22+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project created (nwpcnpils)
- Google Cloud Console access

## Steps

### 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

### 2. Authenticate with Firebase

```bash
firebase login
```

This will open a browser for you to authenticate.

### 3. Install Function Dependencies

```bash
cd functions
npm install
cd ..
```

This installs:
- `firebase-functions` - SDK for writing Cloud Functions
- `firebase-admin` - Admin SDK for Firestore access

### 4. Deploy Cloud Functions

```bash
firebase deploy --only functions
```

This will:
- Compile the TypeScript code in `functions/src/index.ts`
- Deploy the `validateProtocol` function to Firebase
- Output the function URLs

After deployment, you'll see output like:
```
✔  Deploy complete!

Function URL (validateProtocol): https://europe-west2-nwpcnpils.cloudfunctions.net/validateProtocol
```

### 5. Get Firebase Configuration

1. Go to Firebase Console (https://console.firebase.google.com)
2. Select your project "nwpcnpils"
3. Click **⚙️ Settings** > **Project Settings**
4. Scroll to "Your apps" section
5. Click on your Web app or create one if needed
6. Copy the config object

### 6. Set Environment Variables

Create a `.env.local` file in the project root:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=nwpcnpils.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nwpcnpils
VITE_FIREBASE_STORAGE_BUCKET=nwpcnpils.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
VITE_FIREBASE_APP_ID=your_app_id_here
VITE_USE_EMULATOR=false
```

### 6b. Set Gemini API Key For AI Draft Generation

To use Gemini for the admin Drug Builder, add your personal Gemini API key to the functions environment:

```env
# functions/.env
GEMINI_API_KEY=your_gemini_api_key_here
APP_BASE_URL=https://www.mymedinfo.info
```

Notes:
- This key is used only inside Firebase Cloud Functions, not in the browser.
- `APP_BASE_URL` should match the live site that admins use to sign in.
- For local emulator use, `functions/.env` is enough.
- For deployed functions, make sure all of these variables are available when you deploy functions.

### 7. Test Cloud Functions Locally (Optional)

To test functions locally with the emulator:

```bash
# Start the emulator
npm run serve --prefix functions

# In another terminal, run the dev server with emulator enabled
VITE_USE_EMULATOR=true npm run dev
```

## Firestore Database Structure

The Cloud Functions expect data in this structure:

```
/protocols/{protocolId}
  - protocol_id: string (e.g., "nwpcn_master_v1")
  - version: string (e.g., "1.0.0")
  - name: string (e.g., "NWPCN Master Protocol")
  - description: string
  - active_medications: string[] (e.g., ["101", "201", "301"])
  - is_active: boolean
  - created_at: timestamp
  - last_updated: timestamp
  - last_used_at: timestamp (auto-updated)
```

## Using with React App

The React app calls the Cloud Function via:

```typescript
import { validateProtocolWithCloudFunction } from './protocolService';

// Validate a protocol
const result = await validateProtocolWithCloudFunction('nwpcn_master_v1');
if (result.valid) {
  console.log('Active medications:', result.metadata?.active_medications);
}
```

## Protocol Metadata in URL

Pass protocol metadata via Base64-encoded URL parameter:

```typescript
import { encodeProtocolMetadata } from './protocolService';

const metadata = {
  protocol_id: 'nwpcn_master_v1',
  version: '1.0.0',
  active_medications: ['101', '201', '301']
};

const encoded = encodeProtocolMetadata(metadata);
// URL: ?meta=eyJwcm90b2NvbF9pZCI6Im53cGNuX21hc3Rlcl92MSIsLi4ufQ==
```

## Troubleshooting

### Functions not deploying
- Ensure `functions/src/index.ts` has no syntax errors
- Check that `functions/package.json` is valid
- Run `cd functions && npm install` to ensure dependencies are installed

### Cloud Function returning 403 error
- Check Firestore security rules allow read access
- Verify the document exists in Firestore
- Check Cloud Function logs: `firebase functions:log`

### Firebase config not loading
- Ensure `.env.local` has all required variables
- Check that environment variable names match `firebase.ts`
- Restart the dev server after changing `.env.local`

### Function calls failing with network error
- Verify the function URL is correct
- Check browser console for CORS errors
- Ensure firebase.json is in project root

## Monitoring

View function logs and metrics:

```bash
firebase functions:log
```

## Cleanup

To delete deployed functions:

```bash
firebase deploy --only functions --force
# Or delete individual functions in Firebase Console
```
