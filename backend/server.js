import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import forecastRoutes from './routes/forecasts.js';
import advisoryRoutes from './routes/advisory.js';
import chatRoutes from './routes/chat.js';
import agentRoutes from './routes/agent.js';
import predictRoutes from './routes/predict.js';
import pushRoutes from './routes/push.js';
import conversionRoutes from './routes/conversions.js';
import metrics from './metrics.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Basic Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'HazardNet Backend', timestamp: new Date() });
});

// Never serve model artifacts or preprocessing assets from the public server.
app.use(['/Models', '/models', '/hazardnet_fp32.tflite', '/hazardnet_int8.tflite', '/normalization_stats.json', '/labels.json'], (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// API Routes
app.use('/api/v1/forecasts', forecastRoutes);
app.use('/api/advisory', advisoryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/predict', predictRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/conversions', conversionRoutes);

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

// Serve static frontend build files
const distPath = path.resolve(process.cwd(), 'frontend', 'dist');

app.use(express.static(distPath));

// SPA fallback for non-API GET requests
app.get('*', (req, res, next) => {
  if (/\.(tflite|onnx|bin|h5|keras|pt|pth)$/i.test(req.path) || /(^|\/)models?\//i.test(req.path)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.path.startsWith('/api') || req.path.startsWith('/metrics') || req.path.startsWith('/health')) {
    return next();
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).send('Application is building frontend assets, please refresh in a moment.');
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`HazardNet Backend running on port ${PORT}`);
});

export default app;

