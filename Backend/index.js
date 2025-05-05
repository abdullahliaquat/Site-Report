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
    fileSize: 5000 * 1024 * 1024, // 10MB limit
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

async function generateReportContent(photoDescriptions = []) {
  try {
    console.log('Generating report content from photo descriptions...');
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    // Compose a prompt that asks Gemini to generate a dynamic, bolded heading based on the issues described in the photos
    let photoSection = '';
    photoDescriptions.forEach((photo, i) => {
      photoSection += `\nPhoto ${i + 1}:\nDescription: ${photo.description}`;
    });
    const prompt = `You are a professional property inspector. Analyze the following list of photo descriptions.\n\nGenerate a professional, concise, and bolded heading for the report that summarizes the main issue(s) described. Do NOT use any hardcoded or generic text.\n\nFor each photo, generate a detailed, professional report section with the following fields (all fields must be present for each photo, and all field label's headings must be bolded):\n\n- Problem Description\n- Recommended Solution\n- Priority Level (High/Medium/Low)\n- Estimated Cost Range\n- Safety Concerns\n\nUse clear, and professional language. Do NOT use asterisks, markdown, or any special characters for formatting. Use bolded headings and field labels (e.g., Problem Description:) for each section.\n\n${photoSection}\n\nFormat the report as follows:\n1. Start with the bolded heading for the report.\n2. For each photo, provide a bolded section heading (Photo X: <filename>) and the bolded field labels.\n3. Do not use any markdown or asterisks.`;
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

// Endpoints
// 1. Create new report
app.post('/api/reports', upload.array('photos', 20), async (req, res) => {
  try {
    console.log('Received report creation request');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files);

    const { jobName, clientName, address, date, photoDescriptions = '[]' } = req.body;
    let parsedDescriptions = [];
    try {
      parsedDescriptions = JSON.parse(photoDescriptions);
    } catch (e) {
      parsedDescriptions = [];
    }
    if (!jobName || !clientName || !address) {
      console.error('Missing required fields:', { jobName, clientName, address });
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Enforce 1-20 photos
    if (!req.files || req.files.length < 1 || req.files.length > 20) {
      return res.status(400).json({ error: 'You must upload between 1 and 20 photos.' });
    }
    if (!Array.isArray(parsedDescriptions) || parsedDescriptions.length !== req.files.length) {
      return res.status(400).json({ error: 'photoDescriptions array must match number of uploaded files.' });
    }
    // Process each photo and its description
    const photos = [];
    for (let idx = 0; idx < req.files.length; idx++) {
      const f = req.files[idx];
      const desc = parsedDescriptions[idx] || {};
      let description = desc.description || '';
      let type = desc.type || 'text';
      let transcription = '';
      // Validate file type matches description type
      if (type === 'voice') {
        if (!f.mimetype.startsWith('audio/')) {
          return res.status(400).json({ error: `File ${f.originalname} is not an audio file but type is set to 'voice'.` });
        }
        // Transcribe the audio file
        try {
          const fileBuffer = fs.readFileSync(f.path);
          const transcriptResult = await speechToText(fileBuffer);
          transcription = transcriptResult.text || '';
          description = transcription;
        } catch (err) {
          console.error('Error transcribing audio for photo', f.path, err);
          transcription = '';
        }
      } else if (type === 'text') {
        if (!f.mimetype.startsWith('image/')) {
          return res.status(400).json({ error: `File ${f.originalname} is not an image file but type is set to 'text'.` });
        }
      } else {
        return res.status(400).json({ error: `Invalid type for photo at index ${idx}. Must be 'voice' or 'text'.` });
      }
      photos.push({
        path: f.path,
        description,
        type,
        transcription
      });
    }
    const report = {
      id: Date.now().toString(),
      jobName,
      clientName,
      address,
      date: date || new Date().toISOString().split('T')[0],
      photos,
      status: 'draft',
      createdAt: new Date(),
      aiReport: null // Will be filled after AI analysis
    };
    console.log('Created report:', report);
    reports.push(report);
    res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ error: 'Failed to create report', details: error.message });
  }
});

// 2. Generate PDF
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

    // Helper for page numbers
    function addPageNumber(doc, pageNum, totalPages) {
      doc.fontSize(10).fillColor('#222').text(`Page ${pageNum} of ${totalPages}`, doc.page.width - 120, 20, { align: 'right' });
    }

    try {
      // Parse AI report for dynamic headings and sections
      let heading = 'Site Inspection Report';
      let analysis = '';
      if (report.aiReport) {
        const lines = report.aiReport.split('\n').filter(l => l.trim() !== '');
        if (lines.length > 0) {
          heading = lines[0].replace(/\*/g, '').trim();
          analysis = lines.slice(1).join('\n');
        }
      }
      // Split AI output by photo section (assuming Gemini outputs one section per photo)
      const photoSections = analysis.split(/Photo \d+:/).filter(Boolean);

      // --- Page 1: Cover + Photo Grid ---
      doc.addPage();
      addPageNumber(doc, 1, 3);
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a237e').text(heading, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').fillColor('#000').text(`Issue: ${heading}`, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#263238').text('Reference Photos:', { align: 'left' });
      doc.moveDown(0.5);
      // Photo grid (3 per row)
      const photoSize = 120;
      let x = doc.page.margins.left;
      let y = doc.y;
      let count = 0;
      report.photos.forEach((photo, idx) => {
        console.log('PDF: Trying to add photo:', photo.path);
        try {
          if (fs.existsSync(photo.path)) {
            doc.image(photo.path, x, y, { width: photoSize, height: photoSize, align: 'center', valign: 'center' });
            doc.rect(x, y, photoSize, photoSize).stroke('#90caf9');
            doc.fontSize(9).fillColor('#263238').font('Helvetica').text(`Photo ${idx + 1}`, x, y + photoSize + 2, { width: photoSize, align: 'center' });
          } else {
            doc.fontSize(9).fillColor('#b71c1c').text(`Photo ${idx + 1} (missing)`, x, y + photoSize + 2, { width: photoSize, align: 'center' });
            console.error('PDF: Photo file missing:', photo.path);
          }
        } catch (e) {
          doc.fontSize(9).fillColor('#b71c1c').text(`Photo ${idx + 1} (error)`, x, y + photoSize + 2, { width: photoSize, align: 'center' });
          console.error('PDF: Error adding photo:', photo.path, e);
        }
        x += photoSize + 10;
        count++;
        if (count % 3 === 0) {
          x = doc.page.margins.left;
          y += photoSize + 30;
        }
      });
      doc.moveDown(2);

      // --- Page 2: Reference Photo Breakdown ---
      doc.addPage();
      addPageNumber(doc, 2, 3);
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a237e').text(heading, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#263238').text('Reference Photo breakdown:', { align: 'left' });
      doc.moveDown(0.5);
      report.photos.forEach((photo, idx) => {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#263238').text(`Photo ${idx + 1}:`, { continued: false });
        // Show the analysis for this photo
        if (photoSections[idx]) {
          let cleanText = photoSections[idx].replace(/\*/g, '').replace(/\n{2,}/g, '\n').trim();
          cleanText.split('\n').forEach(line => {
            if (/^\s*[-•]/.test(line)) {
              doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(line.trim(), { indent: 20 });
            } else if (line.trim()) {
              doc.font('Helvetica').fontSize(11).fillColor('#000').text(line.trim(), { indent: 10 });
            }
          });
        } else {
          doc.font('Helvetica').fontSize(11).fillColor('#b71c1c').text('No additional notes to be added.', { indent: 10 });
        }
        doc.moveDown(1);
      });
      doc.moveDown(1);

      // --- Page 3: More Photos (if any), Recommended Services, Additional Notes ---
      doc.addPage();
      addPageNumber(doc, 3, 3);
      // More photos if >9
      if (report.photos.length > 9) {
        let x2 = doc.page.margins.left;
        let y2 = doc.y;
        let count2 = 0;
        for (let i = 9; i < report.photos.length; i++) {
          console.log('PDF: Trying to add photo:', report.photos[i].path);
          try {
            if (fs.existsSync(report.photos[i].path)) {
              doc.image(report.photos[i].path, x2, y2, { width: photoSize, height: photoSize, align: 'center', valign: 'center' });
              doc.rect(x2, y2, photoSize, photoSize).stroke('#90caf9');
              doc.fontSize(9).fillColor('#263238').font('Helvetica').text(`Photo ${i + 1}`, x2, y2 + photoSize + 2, { width: photoSize, align: 'center' });
            } else {
              doc.fontSize(9).fillColor('#b71c1c').text(`Photo ${i + 1} (missing)`, x2, y2 + photoSize + 2, { width: photoSize, align: 'center' });
              console.error('PDF: Photo file missing:', report.photos[i].path);
            }
          } catch (e) {
            doc.fontSize(9).fillColor('#b71c1c').text(`Photo ${i + 1} (error)`, x2, y2 + photoSize + 2, { width: photoSize, align: 'center' });
            console.error('PDF: Error adding photo:', report.photos[i].path, e);
          }
          x2 += photoSize + 10;
          count2++;
          if (count2 % 3 === 0) {
            x2 = doc.page.margins.left;
            y2 += photoSize + 30;
          }
        }
        doc.moveDown(2);
      }
      // Recommended Services
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#263238').text('Recommended Services:', { underline: true });
      doc.moveDown(0.5);
      let recommended = '';
      if (analysis.includes('Recommended Services:')) {
        recommended = analysis.split('Recommended Services:')[1].split('Additional Notes:')[0] || '';
      }
      if (recommended.trim()) {
        recommended.split('\n').forEach(line => {
          if (/^\s*[-•]/.test(line)) {
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text(line.trim(), { indent: 20 });
          } else if (line.trim()) {
            doc.font('Helvetica').fontSize(11).fillColor('#000').text(line.trim(), { indent: 10 });
          }
        });
      } else {
        doc.font('Helvetica').fontSize(11).fillColor('#b71c1c').text('No recommended services to be added.', { indent: 10 });
      }
      doc.moveDown(1);
      // Additional Notes
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#263238').text('Additional Notes:', { underline: true });
      doc.moveDown(0.5);
      let notes = '';
      if (analysis.includes('Additional Notes:')) {
        notes = analysis.split('Additional Notes:')[1] || '';
      }
      if (notes.trim()) {
        notes.split('\n').forEach(line => {
          if (line.trim()) doc.font('Helvetica').fontSize(11).fillColor('#000').text(line.trim(), { indent: 10 });
        });
      } else {
        doc.font('Helvetica').fontSize(11).fillColor('#b71c1c').text('No additional project notes at this time.', { indent: 10 });
      }

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

// Endpoint to trigger AI analysis for a report
app.post('/api/reports/:id/analyze', async (req, res) => {
  try {
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    // Only analyze if not already analyzed or if forced
    if (report.aiReport && !req.body.force) {
      return res.json({ aiReport: report.aiReport });
    }
    // Prepare photo descriptions for Gemini
    const photoDescriptions = report.photos.map(photo => ({
      description: photo.description,
      type: photo.type,
      transcription: photo.transcription
    }));
    const aiReport = await generateReportContent(photoDescriptions);
    report.aiReport = aiReport;
    res.json({ aiReport });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze report', details: error.message });
  }
});

// Endpoint to update a report (e.g., to save edited aiReport)
app.patch('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }
  // Only update provided fields
  Object.keys(req.body).forEach(key => {
    if (key in report) {
      report[key] = req.body[key];
    }
  });
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
