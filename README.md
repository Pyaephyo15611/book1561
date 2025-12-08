# BookStore - Online PDF Reading Platform

A full-stack bookstore application where users can browse, read, and download PDF books online. Built with React, Node.js, Firebase, and Backblaze B2.

## Features

- 📚 Browse and search books
- 📖 Read PDFs online with a built-in PDF viewer
- ⬇️ Download PDFs (requires authentication)
- 🔐 Firebase authentication (sign up/sign in)
- 📱 Fully responsive design
- ☁️ Cloud storage with Backblaze B2

## Tech Stack

- **Frontend**: React, React Router, React-PDF
- **Backend**: Node.js, Express
- **Authentication & Database**: Firebase (Auth & Firestore)
- **Storage**: Backblaze B2 Public Bucket
- **Styling**: CSS3 with responsive design

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase project
- Backblaze B2 account with a public bucket

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
npm run install-all
```

### 2. Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Create a service account:
   - Go to Project Settings > Service Accounts
   - Generate a new private key
   - Save the JSON content

### 3. Backblaze B2 Setup

1. Create a Backblaze B2 account
2. Create a public bucket
3. Note your:
   - Application Key ID
   - Application Key
   - Bucket ID
   - Bucket Name
   - Region

### 4. Environment Variables

#### Server (.env in `/server` directory)

```env
PORT=5000

# Firebase Service Account (paste the entire JSON as a single line)
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}

# Backblaze B2
B2_APPLICATION_KEY_ID=your_application_key_id
B2_APPLICATION_KEY=your_application_key
B2_BUCKET_ID=your_bucket_id
B2_BUCKET_NAME=your_bucket_name
B2_REGION=us-west-004
```

#### Client (.env in `/client` directory)

```env
REACT_APP_API_URL=http://localhost:5000
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_B2_BUCKET_ID=your_bucket_id
REACT_APP_B2_REGION=us-west-004
```

### 5. Add Books to Firestore

Create a `books` collection in Firestore with documents like:

```json
{
  "title": "Book Title",
  "author": "Author Name",
  "description": "Book description",
  "coverImage": "https://example.com/cover.jpg",
  "b2FileName": "book.pdf",
  "fileName": "book.pdf"
}
```

Upload your PDF files to Backblaze B2 bucket with the same filename as `b2FileName`.

### 6. Run the Application

```bash
# Run both frontend and backend
npm run dev

# Or run separately:
npm run server  # Backend on port 5000
npm run client  # Frontend on port 3000
```

## Project Structure

```
bookstore/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── firebase/       # Firebase configuration
│   │   └── App.js
│   └── package.json
├── server/                 # Node.js backend
│   ├── index.js           # Express server
│   └── package.json
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/books` - Get all books
- `GET /api/books/:id` - Get book by ID
- `GET /api/books/:id/view` - Get PDF view URL (public)
- `GET /api/books/:id/download` - Get PDF download URL (requires auth)

## Features in Detail

### PDF Viewer
- Built-in PDF viewer using react-pdf
- Page navigation (Previous/Next)
- Responsive design for mobile devices

### Authentication
- Email/password authentication via Firebase
- Protected download routes
- User session management

### Responsive Design
- Mobile-first approach
- Adaptive layouts for tablets and desktops
- Touch-friendly controls

## License

ISC

