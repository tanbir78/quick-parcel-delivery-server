# Quick Parcel Delivery — Backend

Backend API built with Node.js, Express, and MongoDB.

## Features
- User and parcel APIs
- Parcel booking and tracking
- Role-based access (if configured)

## Setup
```bash
npm install
npm start
```

Create a `.env` file with the variables required by your backend, for example:
```env
PORT=5000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
```

## Deployment
Configure environment variables, MongoDB access, and CORS for your deployed frontend.

**Security:** Never upload `.env`, database credentials, or private keys to GitHub.
