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
    // Add original index to filename for uniqueness
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const idx = req.body && req.body.photoDescriptions ? JSON.parse(req.body.photoDescriptions).findIndex(desc => desc && desc.filename === file.originalname) : '';
    const filename = uniqueSuffix + (idx !== '' ? `-${idx}` : '') + path.extname(file.originalname);
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
    // Remove all asterisks from the AI report
    const cleanedText = text.replace(/\*/g, '');
    return cleanedText;
  } catch (error) {
    console.error('Error generating report content:', error);
    throw new Error('Failed to generate report content. Please try again.');
  }
}

// IMPROVED PDF GENERATION FUNCTION
async function generateFormattedPDF(report, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Create a new PDF document with proper margins
      const doc = new PDFDocument({
        autoFirstPage: false,
        margins: {
          top: 50,
          bottom: 50,
          left: 50,
          right: 50
        },
        size: 'A4'
      });
      
      // Create a write stream
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);
      
      // Total pages (fixed at 3 for now, but could be dynamic)
      const totalPages = 3;
      
      // Helper function for page numbers
      function addPageNumber(doc, pageNum) {
        doc.fontSize(10)
           .fillColor('#333333')
           .text(`Page ${pageNum} of ${totalPages}`, 
                 doc.page.width - 100, 
                 20, 
                 { align: 'right' });
      }
      
      // Helper function for consistent section headers
      function addSectionHeader(doc, text) {
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text(text, { underline: false })
           .moveDown(0.5);
      }
      
      // Extract report title from AI report or use job name
      let reportTitle = report.jobName || 'Property Inspection Report';
      if (report.aiReport) {
        const firstLine = report.aiReport.split('\n')[0].trim();
        if (firstLine && firstLine.length > 10) {
          reportTitle = firstLine;
        }
      }
      
      // --- PAGE 1: Title and Photo Grid ---
      doc.addPage();
      addPageNumber(doc, 1);
      
      // Title
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.x = doc.page.margins.left;
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text(reportTitle, doc.page.margins.left, doc.y, { width: contentWidth, align: 'center' })
         .moveDown(1);
      
      // Issue statement
      doc.x = doc.page.margins.left;
      doc.fontSize(12)
         .font('Helvetica')
         .fillColor('#000000')
         .text(`Issue: ${reportTitle}`, doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
         .moveDown(1);
      
      // Reference Photos heading
      addSectionHeader(doc, 'Reference Photos:');
      
      // Photo grid (3 per row)
      const photoSize = 120;
      let x = doc.page.margins.left;
      let y = doc.y;
      let count = 0;
      
      // Only process up to 9 photos on first page
      const firstPagePhotos = report.photos.slice(0, 9);
      
      firstPagePhotos.forEach((photo, idx) => {
        try {
          if (fs.existsSync(photo.path)) {
            doc.image(photo.path, x, y, { 
              width: photoSize, 
              height: photoSize, 
              fit: [photoSize, photoSize],
              align: 'center', 
              valign: 'center' 
            });
            // Add border around photo
            doc.rect(x, y, photoSize, photoSize).stroke('#cccccc');
          } else {
            // Placeholder for missing photo
            doc.rect(x, y, photoSize, photoSize).stroke('#cccccc');
            doc.fontSize(9)
               .fillColor('#cc0000')
               .text('Photo not available', x + 10, y + photoSize/2, { 
                 width: photoSize - 20, 
                 align: 'center' 
               });
          }
        } catch (e) {
          // Error handling for photo loading issues
          doc.rect(x, y, photoSize, photoSize).stroke('#cccccc');
          doc.fontSize(9)
             .fillColor('#cc0000')
             .text('Error loading photo', x + 10, y + photoSize/2, { 
               width: photoSize - 20, 
               align: 'center' 
             });
          console.error('Error adding photo:', photo.path, e);
        }
        
        // Add photo number below image
        doc.fontSize(10)
           .fillColor('#000000')
           .font('Helvetica')
           .text(`Photo ${idx + 1}`, x, y + photoSize + 5, { 
             width: photoSize, 
             align: 'center' 
           });
        
        // Move to next position
        x += photoSize + 20;
        count++;
        
        // Move to next row after 3 photos
        if (count % 3 === 0) {
          x = doc.page.margins.left;
          y += photoSize + 30;
        }
      });
      
      // Ensure we're at the bottom of the grid
      if (count % 3 !== 0) {
        y += photoSize + 30;
      }
      doc.y = y;
      doc.x = doc.page.margins.left;
      
      // --- PAGE 2: Reference Photo breakdown ---
      doc.addPage();
      addPageNumber(doc, 2);
      
      // Title again for consistency
      doc.x = doc.page.margins.left;
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text(reportTitle, doc.page.margins.left, doc.y, { width: contentWidth, align: 'center' })
         .moveDown(1);
      
      // Reference Photo breakdown heading
      addSectionHeader(doc, 'Reference Photo breakdown:');
      
      // Parse AI report for photo sections
      let photoSections = [];
      if (report.aiReport) {
        // Try to extract photo sections using regex
        const photoPattern = /Photo\s+\d+:/gi;
        const matches = [...report.aiReport.matchAll(photoPattern)];
        
        if (matches.length > 0) {
          for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = (i < matches.length - 1) ? matches[i+1].index : report.aiReport.length;
            const section = report.aiReport.substring(start, end).trim();
            photoSections.push(section);
          }
        }
      }
      
      // If we couldn't parse sections, use the photos array directly
      if (photoSections.length === 0 && report.photos.length > 0) {
        photoSections = report.photos.map((photo, idx) => {
          return `Photo ${idx + 1}:\n${photo.description || 'No description provided.'}`;
        });
      }
      
      // Process each photo section
      report.photos.forEach((photo, idx) => {
        // Photo header with clear separation
        doc.x = doc.page.margins.left;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('#000000')
           .text(`Photo ${idx + 1}:`, doc.page.margins.left, doc.y, { width: contentWidth, align: 'left', underline: false })
           .moveDown(0.3);
        
        // Find the corresponding section in the AI report
        const section = photoSections[idx] || '';
        
        // If we have a section from AI, parse and format it
        if (section) {
          // Extract common fields using regex
          const problemMatch = section.match(/Problem Description:(.+?)(?=Recommended Solution:|Priority Level:|Estimated Cost Range:|Safety Concerns:|$)/s);
          const solutionMatch = section.match(/Recommended Solution:(.+?)(?=Problem Description:|Priority Level:|Estimated Cost Range:|Safety Concerns:|$)/s);
          const priorityMatch = section.match(/Priority Level:(.+?)(?=Problem Description:|Recommended Solution:|Estimated Cost Range:|Safety Concerns:|$)/s);
          const costMatch = section.match(/Estimated Cost Range:(.+?)(?=Problem Description:|Recommended Solution:|Priority Level:|Safety Concerns:|$)/s);
          const safetyMatch = section.match(/Safety Concerns:(.+?)(?=Problem Description:|Recommended Solution:|Priority Level:|Estimated Cost Range:|$)/s);
          
          // Format and add each field if found
          if (problemMatch && problemMatch[1]) {
            doc.x = doc.page.margins.left;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('Problem Description:', { continued: true })
               .font('Helvetica')
               .text(problemMatch[1].replace(/\*/g, '').trim(), doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
               .moveDown(0.3);
          }
          
          if (solutionMatch && solutionMatch[1]) {
            doc.x = doc.page.margins.left;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('Recommended Solution:', { continued: true })
               .font('Helvetica')
               .text(solutionMatch[1].replace(/\*/g, '').trim(), doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
               .moveDown(0.3);
          }
          
          if (priorityMatch && priorityMatch[1]) {
            doc.x = doc.page.margins.left;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('Priority Level:', { continued: true })
               .font('Helvetica')
               .text(priorityMatch[1].replace(/\*/g, '').trim(), doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
               .moveDown(0.3);
          }
          
          if (costMatch && costMatch[1]) {
            doc.x = doc.page.margins.left;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('Estimated Cost Range:', { continued: true })
               .font('Helvetica')
               .text(costMatch[1].replace(/\*/g, '').trim(), doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
               .moveDown(0.3);
          }
          
          if (safetyMatch && safetyMatch[1]) {
            doc.x = doc.page.margins.left;
            doc.fontSize(11)
               .font('Helvetica-Bold')
               .fillColor('#000000')
               .text('Safety Concerns:', { continued: true })
               .font('Helvetica')
               .text(safetyMatch[1].replace(/\*/g, '').trim(), doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
               .moveDown(0.3);
          }
        } else {
          // If no AI section, just show the description from the photo object
          doc.x = doc.page.margins.left;
          doc.fontSize(11)
             .font('Helvetica-Bold')
             .fillColor('#000000')
             .text('Description:', { continued: true })
             .font('Helvetica')
             .text(photo.description || ' No description provided.', doc.page.margins.left, doc.y, { width: contentWidth, align: 'left' })
             .moveDown(0.3);
        }
        
        // Add space between photo sections
        doc.moveDown(1);
        
        // Check if we need a page break (rough estimate)
        if (doc.y > doc.page.height - 150 && idx < report.photos.length - 1) {
          doc.addPage();
          addPageNumber(doc, 2);
          doc.x = doc.page.margins.left;
          doc.fontSize(16)
             .font('Helvetica-Bold')
             .fillColor('#000000')
             .text(reportTitle, doc.page.margins.left, doc.y, { width: contentWidth, align: 'center' })
             .moveDown(1);
          doc.fontSize(14)
             .font('Helvetica-Bold')
             .fillColor('#333333')
             .text('Reference Photo breakdown (continued):', doc.page.margins.left, doc.y, { width: contentWidth, align: 'left', underline: false })
             .moveDown(0.5);
        }
      });
      
      // --- PAGE 3: Recommended Services and Additional Notes ---
      doc.addPage();
      addPageNumber(doc, 3);
      doc.x = doc.page.margins.left;
      doc.fontSize(16)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text(reportTitle, doc.page.margins.left, doc.y, { width: contentWidth, align: 'center' })
         .moveDown(1);
      
      // If we have more than 9 photos, show the rest here
      if (report.photos.length > 9) {
        addSectionHeader(doc, 'Additional Photos:');
        
        // Photo grid for remaining photos
        let x2 = doc.page.margins.left;
        let y2 = doc.y;
        let count2 = 0;
        
        const remainingPhotos = report.photos.slice(9);
        remainingPhotos.forEach((photo, idx) => {
          const actualIdx = idx + 9; // Adjust index to account for first page photos
          
          try {
            if (fs.existsSync(photo.path)) {
              doc.image(photo.path, x2, y2, { 
                width: photoSize, 
                height: photoSize, 
                fit: [photoSize, photoSize],
                align: 'center', 
                valign: 'center' 
              });
              // Add border around photo
              doc.rect(x2, y2, photoSize, photoSize).stroke('#cccccc');
            } else {
              // Placeholder for missing photo
              doc.rect(x2, y2, photoSize, photoSize).stroke('#cccccc');
              doc.fontSize(9)
                 .fillColor('#cc0000')
                 .text('Photo not available', x2 + 10, y2 + photoSize/2, { 
                   width: photoSize - 20, 
                   align: 'center' 
                 });
            }
          } catch (e) {
            // Error handling for photo loading issues
            doc.rect(x2, y2, photoSize, photoSize).stroke('#cccccc');
            doc.fontSize(9)
               .fillColor('#cc0000')
               .text('Error loading photo', x2 + 10, y2 + photoSize/2, { 
                 width: photoSize - 20, 
                 align: 'center' 
               });
          }
          
          // Add photo number below image
          doc.fontSize(10)
             .fillColor('#000000')
             .font('Helvetica')
             .text(`Photo ${actualIdx + 1}`, x2, y2 + photoSize + 5, { 
               width: photoSize, 
               align: 'center' 
             });
          
          // Move to next position
          x2 += photoSize + 20;
          count2++;
          
          // Move to next row after 3 photos
          if (count2 % 3 === 0) {
            x2 = doc.page.margins.left;
            y2 += photoSize + 30;
          }
        });
        
        // Ensure we're at the bottom of the grid
        if (count2 % 3 !== 0) {
          y2 += photoSize + 30;
        }
        doc.y = y2;
        doc.moveDown(1);
      }
      
      // Recommended Services section
      addSectionHeader(doc, 'Recommended Services:');
      
      // Extract recommended services from AI report
      let recommendedServices = 'No recommended services to be added.';
      if (report.aiReport && report.aiReport.includes('Recommended Services:')) {
        const servicesSection = report.aiReport.split('Recommended Services:')[1];
        if (servicesSection && servicesSection.includes('Additional Notes:')) {
          recommendedServices = servicesSection.split('Additional Notes:')[0].trim();
        } else if (servicesSection) {
          recommendedServices = servicesSection.trim();
        }
      }
      
      // Format recommended services with bullet points if applicable
      const serviceLines = recommendedServices.split('\n');
      serviceLines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;
        
        if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•')) {
          // This is a bullet point
          doc.fontSize(11)
             .font('Helvetica')
             .fillColor('#000000')
             .text(trimmedLine, { indent: 20 });
        } else {
          // Regular text
          doc.fontSize(11)
             .font('Helvetica')
             .fillColor('#000000')
             .text(trimmedLine);
        }
      });
      
      doc.moveDown(1);
      
      // Additional Notes section
      addSectionHeader(doc, 'Additional Notes:');
      
      // Extract additional notes from AI report
      let additionalNotes = 'No additional project notes at this time.';
      if (report.aiReport && report.aiReport.includes('Additional Notes:')) {
        additionalNotes = report.aiReport.split('Additional Notes:')[1].trim();
        if (additionalNotes) {
          // Format additional notes
          doc.fontSize(11)
             .font('Helvetica')
             .fillColor('#000000')
             .text(additionalNotes);
        } else {
          doc.fontSize(11)
             .font('Helvetica')
             .fillColor('#000000')
             .text('No additional project notes at this time.');
        }
      } else {
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('#000000')
           .text('No additional project notes at this time.');
      }
      
      // Finalize the PDF
      doc.end();
      
      // Handle stream events
      writeStream.on('finish', () => {
        console.log('PDF created successfully at:', outputPath);
        resolve(outputPath);
      });
      
      writeStream.on('error', (err) => {
        console.error('Error writing PDF:', err);
        reject(err);
      });
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
}

// Endpoints
// 1. Create new report
app.post('/api/reports', upload.fields([{ name: 'photos', maxCount: 20 }, { name: 'voices', maxCount: 20 }]), async (req, res) => {
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
    const photoFiles = req.files['photos'] || [];
    const voiceFiles = req.files['voices'] || [];
    if (photoFiles.length < 1 || photoFiles.length > 20) {
      return res.status(400).json({ error: 'You must upload between 1 and 20 photos.' });
    }
    if (!Array.isArray(parsedDescriptions) || parsedDescriptions.length !== photoFiles.length) {
      return res.status(400).json({ error: 'photoDescriptions array must match number of uploaded images.' });
    }
    // Helper to find the voice file for a given voiceFile name
    function findVoiceFile(voiceFileName) {
      return voiceFiles.find(f => f.originalname === voiceFileName);
    }
    // Process each photo and its description
    const photos = [];
    for (let idx = 0; idx < photoFiles.length; idx++) {
      const imageFile = photoFiles[idx];
      const desc = parsedDescriptions[idx] || {};
      let description = desc.description || '';
      let type = desc.type || 'text';
      let transcription = '';
      // For voice notes, find and transcribe the audio file
      if (type === 'voice' && desc.voiceFile) {
        const audioFile = findVoiceFile(desc.voiceFile);
        if (!audioFile) {
          return res.status(400).json({ error: `Audio file ${desc.voiceFile} not found for photo at index ${idx}.` });
        }
        try {
          const fileBuffer = fs.readFileSync(audioFile.path);
          const transcriptResult = await speechToText(fileBuffer);
          transcription = transcriptResult.text || '';
          description = transcription;
        } catch (err) {
          console.error('Error transcribing audio for photo', audioFile.path, err);
          transcription = '';
        }
      }
      photos.push({
        path: imageFile.path,
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

// 2. Generate PDF - UPDATED WITH IMPROVED PDF GENERATION
app.get('/api/reports/:id/pdf', async (req, res) => {
  try {
    console.log('Generating PDF for report:', req.params.id);
    
    const report = reports.find(r => r.id === req.params.id);
    if (!report) {
      console.error('Report not found:', req.params.id);
      return res.status(404).json({ error: 'Report not found' });
    }

    console.log('Creating PDF document...');
    const pdfPath = path.join(__dirname, `report-${report.id}.pdf`);
    
    try {
      // Use the improved PDF generation function
      await generateFormattedPDF(report, pdfPath);
      
      // Send the PDF as a download
      res.download(pdfPath, `report-${report.id}.pdf`, (err) => {
        if (err) {
          console.error('Error sending PDF:', err);
          res.status(500).json({ error: 'Failed to send PDF' });
        }
        // Clean up the file after sending
        try {
          fs.unlinkSync(pdfPath);
          console.log('Temporary PDF file deleted');
        } catch (err) {
          console.error('Error deleting temporary PDF:', err);
        }
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

    // Generate the PDF first
    const pdfPath = path.join(__dirname, `report-${report.id}.pdf`);
    await generateFormattedPDF(report, pdfPath);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Property Report - ${report.jobName}`,
      text: `Please find attached the property report for ${report.jobName}.`,
      attachments: [{
        filename: `report-${report.id}.pdf`,
        path: pdfPath
      }]
    };

    await transporter.sendMail(mailOptions);
    
    // Clean up the PDF file after sending
    try {
      fs.unlinkSync(pdfPath);
      console.log('Temporary PDF file deleted after email sent');
    } catch (err) {
      console.error('Error deleting temporary PDF after email:', err);
    }
    
    res.json({ message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
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