const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const cors = require('cors');
const os = require('os');
const vision = require('@google-cloud/vision');

// Load environment variables but ignore PORT
dotenv.config();
delete process.env.PORT;  // Remove PORT from environment variables

const app = express();
const port = 3000;  // Always use port 3000

console.log('Starting server on port:', port);
console.log('Environment variables loaded:', {
  GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY ? 'Set' : 'Not Set',
  HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ? 'Set' : 'Not Set',
  EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not Set'
});

// Add this at the top of the file, after imports
console.log('Starting server...');

// Enable CORS with more specific configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Kuma-Revision'],
  credentials: true,
  maxAge: 600
}));

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  console.log('Client IP:', req.ip);
  next();
});

// Add detailed request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  next();
});

// Initialize AI and other services
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Add this after the imports
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Add network interface logging
const networkInterfaces = os.networkInterfaces();
console.log('Available network interfaces:', networkInterfaces);

// Log all available IP addresses
Object.keys(networkInterfaces).forEach((interfaceName) => {
  networkInterfaces[interfaceName].forEach((iface) => {
    if (iface.family === 'IPv4' && !iface.internal) {
      console.log(`Available IP: ${iface.address} on interface ${interfaceName}`);
    }
  });
});

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Update the storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('File received:', file);
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 2000 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('Checking file type:', file.mimetype);
    // Accept images and audio files
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'audio/mpeg', 'audio/wav', 'audio/m4a'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      console.error('Invalid file type:', file.mimetype);
      cb(new Error('Invalid file type. Only images and audio files are allowed.'));
    }
  }
});

// Middleware
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Store reports in memory (replace with database in production)
let reports = [];

// Initialize the Vision client
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: 'path/to/your/credentials.json', // or use process.env.GOOGLE_APPLICATION_CREDENTIALS
});

// Helper Functions
async function speechToText(fileBuffer) {
  try {
    console.log('Starting speech to text conversion...');
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
      fileBuffer,
      {
        headers: {
          'Content-Type': 'audio/wav',
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );
    console.log('Speech to text conversion successful');
    return response.data;
  } catch (error) {
    console.error('Error during speech to text conversion:', error.response?.data || error.message);
    throw new Error('Failed to convert speech to text. Please try again.');
  }
}

async function generateReportContent(transcription, photoPaths = []) {
  try {
    console.log('Generating report content from transcription...');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    let photoSection = '';
    let allDescriptions = [];
    for (let i = 0; i < photoPaths.length; i++) {
      const fname = photoPaths[i].split(/[\\/]/).pop();
      const description = await getPhotoDescription(photoPaths[i]);
      allDescriptions.push(description);
      photoSection += `\nPhoto ${i + 1}:\nDescription: ${description}`;
    }
    // Compose a prompt that asks Gemini to generate a dynamic, bolded heading based on the issue
    const prompt = `You are a professional property inspector. Analyze the following voice note transcription and the provided list of photo descriptions.\n\nGenerate a professional, concise, and bolded heading for the report that summarizes the main issue(s) described. Do NOT use any hardcoded or generic text.\n\nFor each photo, generate a detailed, professional report section with the following fields (all fields must be present for each photo, and all field label's headings must be bolded):\n\n- Problem Description\n- Recommended Solution\n- Priority Level (High/Medium/Low)\n- Estimated Cost Range\n- Safety Concerns\n\nUse clear, and professional language. Do NOT use asterisks, markdown, or any special characters for formatting. Use bolded headings and field labels (e.g., Problem Description:) for each section.\n\n${photoSection}\n\nTranscription: "${transcription}"\n\nFormat the report as follows:\n1. Start with the bolded heading for the report.\n2. For each photo, provide a bolded section heading (Photo X: <filename>) and the bolded field labels.\n3. Do not use any markdown or asterisks.`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    console.log('Report content generated successfully');
    return text;
  } catch (error) {
    console.error('Error generating report content:', error);
    throw new Error('Failed to generate report content. Please try again.');
  }
}

async function getPhotoDescription(photoPath) {
  try {
    const imageBuffer = fs.readFileSync(photoPath);
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning',
      imageBuffer,
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );
    // The response is an array of objects with a 'generated_text' field
    if (Array.isArray(response.data) && response.data.length > 0 && response.data[0].generated_text) {
      return response.data[0].generated_text;
    } else {
      return 'No description available.';
    }
  } catch (error) {
    console.error('Huggingface image captioning error for', photoPath, error.response?.data || error.message);
    return 'No description available (Huggingface API error).';
  }
}

// Endpoints
// 1. Create new report
app.post('/api/reports', upload.array('photos', 12), async (req, res) => {
  try {
    console.log('Received report creation request');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const { jobName, clientName, address, date } = req.body;
    
    if (!jobName || !clientName || !address) {
      console.error('Missing required fields:', { jobName, clientName, address });
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Store all photo paths
    const photoPaths = req.files ? req.files.map(f => f.path) : [];

    const report = {
      id: Date.now().toString(),
      jobName,
      clientName,
      address,
      date: date || new Date().toISOString().split('T')[0],
      photos: photoPaths,
      status: 'draft',
      createdAt: new Date()
    };

    console.log('Created report:', report);
    reports.push(report);
    res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Failed to create report', details: error.message });
  }
});

// 2. Add voice note to report
app.post('/api/reports/:id/voice', upload.single('audio'), async (req, res) => {
  try {
    console.log('Processing voice note for report:', req.params.id);
    console.log('Request file:', req.file);
    console.log('Request body:', req.body);

    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
      console.error('Report not found:', req.params.id);
      return res.status(404).json({ error: 'Report not found' });
    }

    if (!req.file) {
      console.error('No audio file provided');
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('Reading audio file from:', req.file.path);
    const fileBuffer = fs.readFileSync(req.file.path);
    console.log('Audio file size:', fileBuffer.length);

    console.log('Converting speech to text...');
    const transcription = await speechToText(fileBuffer);
    console.log('Transcription successful:', transcription);

    // Initialize voiceNote object with transcription
    const voiceNote = {
      audioPath: req.file.path,
      transcription: transcription.text,
      problemDescription: req.body.problemDescription,
      recommendedSolution: req.body.recommendedSolution,
      processedAt: new Date()
    };

    try {
      console.log('Generating report content...');
      const elaboratedText = await generateReportContent(transcription.text, report.photos);
      console.log('Report content generated successfully');
      voiceNote.elaboratedText = elaboratedText;
    } catch (error) {
      console.error('Error generating report content:', error);
      // Continue even if Gemini API fails
      voiceNote.elaboratedText = 'AI analysis could not be generated. Please try again later.';
    }

    report.voiceNote = voiceNote;
    console.log('Voice note processing completed successfully');
    res.json(report);
  } catch (error) {
    console.error('Error processing voice note:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    res.status(500).json({ 
      error: 'Failed to process voice note',
      details: error.message 
    });
  }
});

// 3. Generate PDF
app.get('/api/reports/:id/pdf', async (req, res) => {
  try {
    console.log('Generating PDF for report:', req.params.id);
    
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
      console.error('Report not found:', req.params.id);
      return res.status(404).json({ error: 'Report not found' });
    }

    console.log('Creating PDF document...');
    const doc = new PDFDocument({ autoFirstPage: false });
    const pdfPath = path.join(__dirname, `report-${report.id}.pdf`);
    const writeStream = fs.createWriteStream(pdfPath);

    writeStream.on('error', (err) => {
      console.error('Error writing PDF:', err);
      res.status(500).json({ error: 'Failed to write PDF file' });
    });

    doc.pipe(writeStream);

    try {
      // Cover Page with dynamic heading
      doc.addPage();
      // Extract the first line as the heading (Gemini output should start with the heading)
      let heading = 'Site Inspection Report';
      let analysis = '';
      if (report.voiceNote && report.voiceNote.elaboratedText) {
        const lines = report.voiceNote.elaboratedText.split('\n').filter(l => l.trim() !== '');
        if (lines.length > 0) {
          heading = lines[0].replace(/\*/g, '').trim();
          analysis = lines.slice(1).join('\n');
        }
      }
      doc.fontSize(25).font('Helvetica-Bold').text(heading, { align: 'center' });
      doc.moveDown();
      doc.fontSize(16).font('Helvetica-Bold').text(`Job:`, { continued: true }).font('Helvetica').text(` ${report.jobName}`);
      doc.font('Helvetica-Bold').text(`Client:`, { continued: true }).font('Helvetica').text(` ${report.clientName}`);
      doc.font('Helvetica-Bold').text(`Address:`, { continued: true }).font('Helvetica').text(` ${report.address}`);
      doc.font('Helvetica-Bold').text(`Date:`, { continued: true }).font('Helvetica').text(` ${report.date}`);
      doc.moveDown();

      // Reference Photos Section
      if (report.photos && report.photos.length > 0) {
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold').text('Reference Photos:', { underline: true });
        doc.moveDown(0.5);
        // Display photos in a grid (3 per row)
        const photoSize = 170;
        let x = doc.page.margins.left;
        let y = doc.y;
        let count = 0;
        report.photos.forEach((photo, idx) => {
          if (fs.existsSync(photo)) {
            doc.image(photo, x, y, { width: photoSize, height: photoSize, align: 'center', valign: 'center' });
          }
          x += photoSize + 10;
          count++;
          if (count % 3 === 0) {
            x = doc.page.margins.left;
            y += photoSize + 10;
          }
        });
        doc.moveDown(2);
      }

      // Reference Photo Analysis Section
      if (analysis && report.photos && report.photos.length > 0) {
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold').text('Photo Analysis', { underline: true });
        doc.moveDown();
        // Split Gemini output by photo section (assuming Gemini outputs one section per photo)
        // We'll use 'Photo X:' as the delimiter
        const photoSections = analysis.split(/Photo \d+:/).filter(Boolean);
        report.photos.forEach((photo, idx) => {
          const fname = photo.split(/[\\/]/).pop();
          doc.fontSize(14).font('Helvetica-Bold').text(`Photo ${idx + 1}: ${fname}`);
          doc.moveDown(0.2);
          if (photoSections[idx]) {
            // Remove any asterisks and extra whitespace
            let cleanText = photoSections[idx].replace(/\*/g, '').replace(/\n{2,}/g, '\n').trim();
            // Bold field labels (Problem Description, etc.)
            const fields = ['Problem Description:', 'Recommended Solution:', 'Priority Level:', 'Estimated Cost Range:', 'Safety Concerns:'];
            fields.forEach(field => {
              cleanText = cleanText.replace(new RegExp(field, 'g'), `\n\u2022 ` + field);
            });
            // Split by lines and bold field labels
            cleanText.split('\n').forEach(line => {
              const match = fields.find(f => line.trim().startsWith('\u2022 ' + f));
              if (match) {
                doc.font('Helvetica-Bold').fontSize(12).text(line.trim(), { continued: false });
              } else {
                doc.font('Helvetica').fontSize(12).text(line.trim(), { continued: false });
              }
            });
            doc.moveDown();
          } else {
            doc.font('Helvetica').fontSize(12).text('No analysis available for this photo.');
            doc.moveDown();
          }
        });
      }

      // Recommended Services Section
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text('Recommended Services:', { underline: true });
      doc.moveDown();
      doc.font('Helvetica').fontSize(12).text('Service recommendations will be listed here.');
      doc.moveDown();

      // Additional Notes Section
      doc.fontSize(18).font('Helvetica-Bold').text('Additional Notes:', { underline: true });
      doc.moveDown();
      doc.font('Helvetica').fontSize(12).text('No additional project notes at this time.');

      doc.end();

      writeStream.on('finish', () => {
        console.log('PDF generated successfully:', pdfPath);
        res.download(pdfPath, `report-${report.id}.pdf`, (err) => {
          if (err) {
            console.error('Error sending PDF:', err);
            res.status(500).json({ error: 'Failed to send PDF' });
          }
          try {
            fs.unlinkSync(pdfPath);
            console.log('Temporary PDF file deleted');
          } catch (err) {
            console.error('Error deleting temporary PDF:', err);
          }
        });
      });
    } catch (err) {
      console.error('Error generating PDF content:', err);
      res.status(500).json({ error: 'Failed to generate PDF content', details: err.message });
    }
  } catch (error) {
    console.error('Error in PDF generation:', error);
    res.status(500).json({ 
      error: 'Failed to generate PDF',
      details: error.message 
    });
  }
});

// 4. Email Report
app.post('/api/reports/:id/email', async (req, res) => {
  try {
    const { email } = req.body;
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Property Report - ${report.jobName}`,
      text: `Please find attached the property report for ${report.jobName}.`,
      attachments: [{
        filename: `report-${report.id}.pdf`,
        path: path.join(__dirname, `report-${report.id}.pdf`)
      }]
    };

    await transporter.sendMail(mailOptions);
    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// 5. Get all reports
app.get('/api/reports', (req, res) => {
  res.json(reports);
});

// 6. Get single report
app.get('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json(report);
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', {
    message: err.message,
    stack: err.stack,
    code: err.code
  });
  res.status(500).json({ 
    error: 'Server error',
    details: err.message 
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on port ${port}`);
  console.log(`Test URL: http://localhost:${port}/api/test`);
  console.log(`Reports URL: http://localhost:${port}/api/reports`);
}).on('error', (err) => {
  console.error('Failed to start server:', err);
});

// Helper function to get local IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
