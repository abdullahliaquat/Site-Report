<<<<<<< HEAD
# Site Report Automation App

A mobile app for creating and managing site inspection reports with photo capture, voice notes, and AI-powered text elaboration.

## Features

- Create new site inspection reports
- Capture photos of job-site issues
- Record voice notes about problems and solutions
- AI-powered text elaboration from voice notes
- Generate professional PDF reports
- Email reports to clients
- Track and manage previous reports

## Tech Stack

### Frontend
- React Native
- Expo
- React Navigation
- React Native Paper
- Expo Image Picker
- Expo AV

### Backend
- Node.js
- Express
- Google Gemini AI
- HuggingFace Whisper
- PDFKit
- Nodemailer

## Setup

### Backend
1. Navigate to the Backend directory:
   ```bash
   cd Backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   PORT=5000
   GOOGLE_AI_KEY=your_google_ai_key
   HUGGINGFACE_API_KEY=your_huggingface_api_key
   HUGGINGFACE_API_URL=https://api-inference.huggingface.co/models/openai/whisper-large-v3
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_app_password
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

### Frontend
1. Navigate to the SiteReport directory:
   ```bash
   cd SiteReport
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npm start
   ```

4. Run on iOS or Android:
   ```bash
   # For iOS
   npm run ios

   # For Android
   npm run android
   ```

## Usage

1. **Create a New Report**
   - Enter job details (name, client, address, date)
   - Add photos of the site
   - Save the report

2. **Add Report Items**
   - Record voice notes about issues
   - Add photos of specific problems
   - AI will elaborate on the voice notes
   - Edit the elaborated text if needed

3. **Preview and Share**
   - Preview the generated report
   - Generate PDF
   - Email the report to clients
   - Share via other apps

## Development

### Project Structure
```
SiteReport/
├── App.js                 # Main app component
├── api/
│   └── client.js          # API client for backend communication
├── screens/
│   ├── NewReportScreen.js
│   ├── AddItemScreen.js
│   ├── PreviewReportScreen.js
│   └── ReportActionsScreen.js
└── ...

Backend/
├── index.js              # Main server file
├── uploads/              # Temporary file storage
└── ...
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
This project is licensed under the MIT License - see the LICENSE file for details. "# Site-Report" 
"# Site-Report" 
=======
# Site Report Automation App

A mobile app for creating and managing site inspection reports with photo capture, voice notes, and AI-powered text elaboration.

## Features

- Create new site inspection reports
- Capture photos of job-site issues
- Record voice notes about problems and solutions
- AI-powered text elaboration from voice notes
- Generate professional PDF reports
- Email reports to clients
- Track and manage previous reports

## Tech Stack

### Frontend
- React Native
- Expo
- React Navigation
- React Native Paper
- Expo Image Picker
- Expo AV

### Backend
- Node.js
- Express
- Google Gemini AI
- HuggingFace Whisper
- PDFKit
- Nodemailer

## Setup

### Backend
1. Navigate to the Backend directory:
   ```bash
   cd Backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   PORT=5000
   GOOGLE_AI_KEY=your_google_ai_key
   HUGGINGFACE_API_KEY=your_huggingface_api_key
   HUGGINGFACE_API_URL=https://api-inference.huggingface.co/models/openai/whisper-large-v3
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_email_app_password
   ```

4. Start the backend server:
   ```bash
   npm start
   ```

### Frontend
1. Navigate to the SiteReport directory:
   ```bash
   cd SiteReport
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npm start
   ```

4. Run on iOS or Android:
   ```bash
   # For iOS
   npm run ios

   # For Android
   npm run android
   ```

## Usage

1. **Create a New Report**
   - Enter job details (name, client, address, date)
   - Add photos of the site
   - Save the report

2. **Add Report Items**
   - Record voice notes about issues
   - Add photos of specific problems
   - AI will elaborate on the voice notes
   - Edit the elaborated text if needed

3. **Preview and Share**
   - Preview the generated report
   - Generate PDF
   - Email the report to clients
   - Share via other apps

## Development

### Project Structure
```
SiteReport/
├── App.js                 # Main app component
├── api/
│   └── client.js          # API client for backend communication
├── screens/
│   ├── NewReportScreen.js
│   ├── AddItemScreen.js
│   ├── PreviewReportScreen.js
│   └── ReportActionsScreen.js
└── ...

Backend/
├── index.js              # Main server file
├── uploads/              # Temporary file storage
└── ...
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
This project is licensed under the MIT License - see the LICENSE file for details. "# Site-Report" 
>>>>>>> 156c71a1268a9f3e9cb49e576c3154d20144c886
